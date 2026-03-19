import { prepareGuildInteraction } from '../../../../discord/interactions/prepareGuildInteraction';
import { resolveGuildMember } from '../../../../discord/interactions/interactionPreflight';
import type { ExecutionContext } from '../../../../logging/executionContext';
import { createEventDraft } from '../../../../services/event-lifecycle';
import { resolveEventStartCommand } from './resolveEventStartCommand';
import { presentEventStartResult } from './eventStartResultPresenter';
import { createEventDraftRuntime } from './eventDraftRuntime';

type HandleEventStartParams = {
	interaction: import('@sapphire/plugin-subcommands').Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handleEventStart({ interaction, context }: HandleEventStartParams) {
	const caller = 'handleEventStart';
	const prepared = await prepareGuildInteraction({
		interaction,
		context,
		caller,
		guildLogMessage: 'Failed to resolve configured guild while handling event start',
		guildFailureMessage: 'Could not resolve configured guild. Please contact TECH with:',
		requestId: true,
		defer: 'ephemeralReply'
	});
	if (!prepared) {
		return;
	}
	const { guild, logger, responder } = prepared;

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
			createEventDraftRuntime({
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
