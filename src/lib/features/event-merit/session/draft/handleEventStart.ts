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
		logger.info(
			{
				hostDiscordUserId: issuer.id,
				requestedEventTierId: interaction.options.getString('tier_level'),
				requestedEventName: interaction.options.getString('event_name'),
				issuerVoiceChannelId: issuer.voice.channelId ?? null
			},
			'event.session.create_draft.started'
		);

		const resolvedCommand = await resolveEventStartCommand({
			interaction,
			guild,
			issuer,
			logger
		});
		if (resolvedCommand.kind === 'fail') {
			logger.info(
				{
					hostDiscordUserId: issuer.id,
					delivery: resolvedCommand.delivery,
					requestId: resolvedCommand.requestId ?? false
				},
				'event.session.create_draft.rejected'
			);
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

		logger.info(
			{
				hostDiscordUserId: issuer.id,
				eventTierId: resolvedCommand.createDraftInput.eventTierId,
				eventName: resolvedCommand.createDraftInput.eventName,
				primaryVoiceChannelId: resolvedCommand.createDraftInput.primaryVoiceChannelId,
				trackingChannelId: resolvedCommand.trackingChannel.id
			},
			'event.session.create_draft.validated'
		);

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
			logger.info(
				{
					hostDiscordUserId: issuer.id,
					resultKind: result.kind,
					eventTierId: resolvedCommand.createDraftInput.eventTierId,
					eventName: resolvedCommand.createDraftInput.eventName
				},
				'event.session.create_draft.rejected'
			);
			await responder.safeEditReply({
				content: response.content
			});
			return;
		}

		await interaction.deleteReply().catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					hostDiscordUserId: issuer.id,
					eventTierId: resolvedCommand.createDraftInput.eventTierId,
					eventName: resolvedCommand.createDraftInput.eventName
				},
				'Failed to delete event start ephemeral reply after successful draft creation'
			);
			return null;
		});

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
