import { container } from '@sapphire/framework';
import { ChannelType, type ForumChannel, type Guild, type TextChannel } from 'discord.js';
import { z } from 'zod';
import { ENV_DISCORD } from '../../../../config/env/discord';
import { createInteractionResponder } from '../../../discord/interactionResponder';
import { resolveConfiguredGuild, resolveGuildMember } from '../../../discord/interactionPreflight';
import type { ExecutionContext } from '../../../logging/executionContext';
import { createEventDraft } from '../../../services/event-lifecycle/eventLifecycleService';
import { createEventDraftDeps } from './eventLifecycleServiceAdapters';

type HandleEventStartParams = {
	interaction: import('@sapphire/plugin-subcommands').Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

const EVENT_TIER_ID_SCHEMA = z.coerce.number().int().positive();

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

	const primaryVoiceChannelId = issuer.voice.channelId;
	if (!primaryVoiceChannelId) {
		await responder.safeEditReply({
			content: 'You must be in a voice channel to start an event.'
		});
		return;
	}

	const rawEventTierId = interaction.options.getString('tier_level', true);
	const parsedEventTierId = EVENT_TIER_ID_SCHEMA.safeParse(rawEventTierId);
	if (!parsedEventTierId.success) {
		await responder.safeEditReply({
			content: 'Invalid event tier selection.'
		});
		return;
	}

	const eventName = interaction.options.getString('event_name', true).trim();
	if (eventName.length === 0) {
		await responder.safeEditReply({
			content: 'Event name is required.'
		});
		return;
	}

	const trackingChannel = await resolveTrackingChannel(guild);
	if (!trackingChannel) {
		logger.error(
			{
				trackingChannelId: ENV_DISCORD.EVENT_TRACKING_CHANNEL_ID
			},
			'Configured event tracking channel not found or unsupported type'
		);
		await responder.safeEditReply({
			content: `Configured event tracking channel not found or unsupported type: <#${ENV_DISCORD.EVENT_TRACKING_CHANNEL_ID}>`
		});
		return;
	}

	try {
		const dbUser = await container.utilities.userDirectory.getOrThrow({
			discordUserId: issuer.id
		});
		const result = await createEventDraft(
			createEventDraftDeps({
				guild,
				trackingChannel,
				logger
			}),
			{
				hostDbUserId: dbUser.id,
				hostDiscordUserId: issuer.id,
				issuerTag: interaction.user.tag,
				eventTierId: parsedEventTierId.data,
				eventName,
				primaryVoiceChannelId
			}
		);
		if (result.kind === 'tier_not_found') {
			await responder.safeEditReply({
				content: 'Selected event tier is not available.'
			});
			return;
		}
		if (result.kind === 'tracking_thread_failed') {
			await responder.fail('Failed to create the event tracking thread. Please contact a TECH member with the following:', {
				requestId: true
			});
			return;
		}

		await interaction.deleteReply().catch(() => null);

		logger.info(
			{
				eventSessionId: result.eventSessionId,
				eventTierId: parsedEventTierId.data,
				hostDiscordUserId: issuer.id,
				primaryVoiceChannelId,
				trackingThreadId: result.trackingThreadId
			},
			'Created event draft from /event start'
		);
	} catch (err) {
		logger.error(
			{
				err,
				hostDiscordUserId: issuer.id,
				eventTierId: parsedEventTierId.data,
				primaryVoiceChannelId,
				trackingThreadId: null
			},
			'Failed to create event draft'
		);

		await responder.fail('Failed to create event draft. Please contact a TECH member with the following:', {
			requestId: true
		});
	}
}

async function resolveTrackingChannel(guild: Guild): Promise<TextChannel | ForumChannel | null> {
	const channel =
		guild.channels.cache.get(ENV_DISCORD.EVENT_TRACKING_CHANNEL_ID) ??
		(await guild.channels.fetch(ENV_DISCORD.EVENT_TRACKING_CHANNEL_ID).catch(() => null));

	if (!channel) {
		return null;
	}

	if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildForum) {
		return channel;
	}

	return null;
}
