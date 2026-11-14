import type { Subcommand } from '@sapphire/plugin-subcommands';
import { ENV_DISCORD } from '../../../config/env';
import { prepareGuildInteraction } from '../../discord/interactions/prepareGuildInteraction';
import { resolveInteractionActor } from '../../discord/interactions/interactionPreflight';
import { createInteractionResponder } from '../../discord/interactions/interactionResponder';
import type { ExecutionContext } from '../../logging/executionContext';
import { toErrorLogFields } from '../../logging/errorDetails';
import { IaeRecoveryError, runIaeEventRecovery } from '../../services/event-recovery/iaeEventRecovery';
import { createIaeEventRecoveryDeps } from './createIaeEventRecoveryDeps';

/** Temporary ingress: target event 1011 is fixed inside the recovery service. */
export async function handleRecoverIaeEvent({
	interaction,
	context
}: {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
}) {
	let logger = context.logger;
	let responder = createInteractionResponder({ interaction, context, logger, caller: 'handleRecoverIaeEvent' });
	try {
		// Do not resolve the configured guild or read privileged recovery state for a foreign interaction.
		if (interaction.guildId !== ENV_DISCORD.DISCORD_GUILD_ID) {
			await responder.deferEphemeralReply();
			await responder.fail('This recovery command is only available in the configured server.', { requestId: true });
			return;
		}
		const prepared = await prepareGuildInteraction({
			interaction,
			context,
			caller: 'handleRecoverIaeEvent',
			loggerBindings: { eventSessionId: 1011 },
			guildLogMessage: 'Failed to resolve IAE recovery guild',
			guildFailureMessage: 'Could not resolve the recovery server.',
			requestId: true,
			defer: 'ephemeralReply'
		});
		if (!prepared) return;
		({ logger, responder } = prepared);
		const actor = await resolveInteractionActor({
			guild: prepared.guild,
			discordUserId: interaction.user.id,
			responder,
			logger,
			logMessage: 'Failed to resolve IAE recovery actor',
			failureMessage: 'Could not resolve your member record.',
			requestId: true,
			capabilityRequirement: 'staff',
			unauthorizedMessage: 'Only staff can use this recovery command.'
		});
		if (!actor) return;
		const apply = interaction.options.getBoolean('apply', false) ?? false;
		const result = await runIaeEventRecovery(createIaeEventRecoveryDeps({ guild: prepared.guild, logger }), { actor: actor.actor, apply });
		if (result.kind === 'forbidden') {
			await responder.fail('Only staff can use this recovery command.', { requestId: true });
			return;
		}
		logger.info(
			{ eventSessionId: 1011, apply, result: result.kind, databaseAction: result.databaseAction, messageAction: result.messageAction },
			'event.iae_recovery.completed'
		);
		await responder.safeEditReply({
			content: [
				result.kind === 'dry_run_ready' ? 'Dry run for IAE event 1011: no changes made.' : 'IAE event 1011 review recovery completed.',
				`Participants: ${result.participantCount}. Database action: ${result.databaseAction}. Review message action: ${result.messageAction}.`,
				'No merits or medals were awarded.',
				`requestId=\`${context.requestId}\``
			].join('\n')
		});
	} catch (error) {
		const phase = error instanceof IaeRecoveryError ? error.phase : 'preflight';
		logger.error({ ...toErrorLogFields(error), eventSessionId: 1011, phase }, 'event.iae_recovery.failed');
		await responder.fail('Could not complete IAE review recovery. No merits or medals were awarded. Check the recovery result before retrying.', {
			requestId: true
		});
	}
}
