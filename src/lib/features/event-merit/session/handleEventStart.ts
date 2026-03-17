import { createInteractionResponder } from '../../../discord/interactionResponder';
import { resolveConfiguredGuild, resolveGuildMember } from '../../../discord/interactionPreflight';
import type { ExecutionContext } from '../../../logging/executionContext';
import { createEventDraft } from '../../../services/event-lifecycle/eventLifecycleService';
import { createEventDraftDeps } from './eventLifecycleServiceAdapters';
import { resolveEventStartCommand } from './eventStartCommandAdapter';
import { presentEventStartResult } from './eventStartResultPresenter';

type HandleEventStartParams = {
	interaction: import('@sapphire/plugin-subcommands').Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handleEventStart({ interaction, context }: HandleEventStartParams) {
	const caller = 'handleEventStart';
	const logger = context.logger.child({ caller });
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

	await responder.deferEphemeralReply();

	const guild = await resolveConfiguredGuild({
		interaction,
		responder,
		logger,
		logMessage: 'Failed to resolve configured guild while handling event start',
		failureMessage: 'Could not resolve configured guild. Please contact TECH with:',
		requestId: true
	});
	if (!guild) {
		return;
	}

	const issuer = await resolveGuildMember({
		guild,
		discordUserId: interaction.user.id,
		responder,
		logger,
		logMessage: 'Failed to resolve issuer member while handling event start',
		failureMessage: 'Could not resolve your member record. Please contact TECH with:',
		requestId: true
	});
	if (!issuer) {
		return;
	}

	try {
		const resolvedCommand = await resolveEventStartCommand({
			interaction,
			guild,
			issuer,
			logger
		});
		if (resolvedCommand.kind === 'fail') {
			if (resolvedCommand.delivery === 'fail') {
				await responder.fail(resolvedCommand.content, {
					requestId: resolvedCommand.requestId
				});
				return;
			}

			await responder.safeEditReply({
				content: resolvedCommand.content
			});
			return;
		}

		const result = await createEventDraft(
			createEventDraftDeps({
				guild,
				trackingChannel: resolvedCommand.trackingChannel,
				logger
			}),
			resolvedCommand.createDraftInput
		);
		const response = presentEventStartResult(result);
		if (response.delivery === 'fail') {
			if (result.kind === 'tracking_thread_failed') {
				logger.error(
					{
						eventTierId: resolvedCommand.createDraftInput.eventTierId,
						hostDiscordUserId: issuer.id,
						primaryVoiceChannelId: resolvedCommand.createDraftInput.primaryVoiceChannelId
					},
					'event.session.create_draft.failed'
				);
			}
			await responder.fail(response.content, {
				requestId: response.requestId
			});
			return;
		}
		if (response.delivery === 'editReply') {
			await responder.safeEditReply({
				content: response.content
			});
			return;
		}

		await interaction.deleteReply().catch(() => null);

		if (result.kind === 'draft_created') {
			logger.info(
				{
					eventSessionId: result.eventSessionId,
					eventTierId: resolvedCommand.createDraftInput.eventTierId,
					hostDiscordUserId: issuer.id,
					primaryVoiceChannelId: resolvedCommand.createDraftInput.primaryVoiceChannelId,
					trackingThreadId: result.trackingThreadId
				},
				'event.session.created'
			);
		}
	} catch (err) {
		logger.error(
			{
				err,
				hostDiscordUserId: issuer.id,
				eventTierId: interaction.options.getString('tier_level'),
				primaryVoiceChannelId: issuer.voice.channelId,
				trackingThreadId: null
			},
			'Failed to create event draft'
		);

		await responder.fail('Failed to create event draft. Please contact a TECH member with the following:', {
			requestId: true
		});
	}
}
