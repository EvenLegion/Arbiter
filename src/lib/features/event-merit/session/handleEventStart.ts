import { container } from '@sapphire/framework';
import { EventSessionChannelKind, EventSessionMessageKind, EventSessionState } from '@prisma/client';
import {
	ChannelType,
	MessageFlags,
	ThreadAutoArchiveDuration,
	type ForumChannel,
	type Guild,
	type Message,
	type TextChannel,
	type ThreadChannel
} from 'discord.js';
import { z } from 'zod';
import { ENV_DISCORD } from '../../../../config/env/discord';
import {
	createDraftEventSession,
	findUniqueActiveEventTierById,
	upsertEventSessionChannel,
	upsertEventSessionMessageRef
} from '../../../../integrations/prisma';
import type { ExecutionContext } from '../../../logging/executionContext';
import { buildEventStartConfirmationPayload } from '../ui/buildEventStartConfirmationPayload';
import { buildEventTrackingSummaryEmbed } from '../ui/buildEventTrackingSummaryEmbed';

type HandleEventStartParams = {
	interaction: import('@sapphire/plugin-subcommands').Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

const EVENT_TIER_ID_SCHEMA = z.coerce.number().int().positive();

export async function handleEventStart({ interaction, context }: HandleEventStartParams) {
	const caller = 'handleEventStart';
	const logger = context.logger.child({ caller });

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const guild = interaction.guild ?? (await container.utilities.guild.getOrThrow());
	const issuer = await container.utilities.member.getOrThrow({
		guild,
		discordUserId: interaction.user.id
	});

	const primaryVoiceChannelId = issuer.voice.channelId;
	if (!primaryVoiceChannelId) {
		await interaction.editReply({
			content: 'You must be in a voice channel to start an event.'
		});
		return;
	}

	const rawEventTierId = interaction.options.getString('tier_level', true);
	const parsedEventTierId = EVENT_TIER_ID_SCHEMA.safeParse(rawEventTierId);
	if (!parsedEventTierId.success) {
		await interaction.editReply({
			content: 'Invalid event tier selection.'
		});
		return;
	}

	const eventName = interaction.options.getString('event_name', true).trim();
	if (eventName.length === 0) {
		await interaction.editReply({
			content: 'Event name is required.'
		});
		return;
	}

	const eventTier = await findUniqueActiveEventTierById({
		eventTierId: parsedEventTierId.data
	});
	if (!eventTier) {
		await interaction.editReply({
			content: 'Selected event tier is not available.'
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
		await interaction.editReply({
			content: `Configured event tracking channel not found or unsupported type: <#${ENV_DISCORD.EVENT_TRACKING_CHANNEL_ID}>`
		});
		return;
	}

	const primaryVoiceChannel = await resolvePrimaryVoiceChannel(guild, primaryVoiceChannelId);
	if (primaryVoiceChannel) {
		await primaryVoiceChannel
			.setName(buildParentVoiceChannelName({ tierName: eventTier.name, eventName }), `Event draft created by ${interaction.user.tag}`)
			.catch((renameErr: unknown) => {
				logger.error(
					{
						err: renameErr,
						primaryVoiceChannelId,
						eventName
					},
					'Failed to rename primary voice channel for event draft'
				);
			});
	}

	let trackingThreadId: string | null = null;
	try {
		const thread = await createTrackingThread({
			channel: trackingChannel,
			eventName,
			tierName: eventTier.name,
			issuerTag: interaction.user.tag,
			issuerDiscordUserId: interaction.user.id
		});
		trackingThreadId = thread.id;

		const dbUser = await container.utilities.userDirectory.getOrThrow({
			discordUserId: issuer.id
		});

		const eventSession = await createDraftEventSession({
			hostDbUserId: dbUser.id,
			eventTierId: eventTier.id,
			threadId: thread.id,
			name: eventName,
			primaryChannelId: primaryVoiceChannelId,
			addedByDbUserId: dbUser.id
		});
		await upsertEventSessionChannel({
			eventSessionId: eventSession.id,
			channelId: thread.id,
			kind: EventSessionChannelKind.EVENT_THREAD,
			addedByDbUserId: dbUser.id
		});

		const summaryMessage = await thread.send({
			embeds: [
				buildEventTrackingSummaryEmbed({
					eventSessionId: eventSession.id,
					eventName: eventSession.name,
					tierName: eventTier.name,
					tierMeritAmount: eventTier.meritAmount,
					hostDiscordUserId: issuer.id,
					trackedChannelIds: [primaryVoiceChannelId],
					trackingThreadId: thread.id,
					state: EventSessionState.DRAFT
				})
			]
		});

		await upsertEventSessionMessageRef({
			eventSessionId: eventSession.id,
			kind: EventSessionMessageKind.TRACKING_SUMMARY,
			channelId: summaryMessage.channelId,
			messageId: summaryMessage.id
		});

		const confirmationPayload = buildEventStartConfirmationPayload({
			eventSessionId: eventSession.id,
			eventName: eventSession.name,
			tierName: eventTier.name,
			tierMeritAmount: eventTier.meritAmount,
			primaryVoiceChannelId,
			trackingThreadId: thread.id
		});

		const threadConfirmationMessage = await thread.send({
			content: `<@${interaction.user.id}>`,
			...confirmationPayload
		});
		const voiceChatConfirmationMessage = await sendConfirmationToVoiceChat({
			guild,
			primaryVoiceChannelId,
			confirmationPayload,
			logger
		});

		await interaction.deleteReply().catch(() => null);

		await upsertEventSessionMessageRef({
			eventSessionId: eventSession.id,
			kind: EventSessionMessageKind.DRAFT_CONFIRMATION,
			channelId: threadConfirmationMessage.channelId,
			messageId: threadConfirmationMessage.id
		});
		if (voiceChatConfirmationMessage) {
			await upsertEventSessionMessageRef({
				eventSessionId: eventSession.id,
				kind: EventSessionMessageKind.ACTIVE,
				channelId: voiceChatConfirmationMessage.channelId,
				messageId: voiceChatConfirmationMessage.id
			});
		}

		logger.info(
			{
				eventSessionId: eventSession.id,
				eventTierId: eventTier.id,
				eventTierCode: eventTier.code,
				hostDiscordUserId: issuer.id,
				primaryVoiceChannelId,
				trackingThreadId: thread.id
			},
			'Created event draft from /event start'
		);
	} catch (err) {
		logger.error(
			{
				err,
				hostDiscordUserId: issuer.id,
				eventTierId: eventTier.id,
				primaryVoiceChannelId,
				trackingThreadId
			},
			'Failed to create event draft'
		);

		if (trackingThreadId) {
			await trackingChannel.threads
				.fetch(trackingThreadId)
				.then(async (thread) => thread?.delete('Cleaning up tracking thread after failed event draft creation'))
				.catch((cleanupErr: unknown) => {
					logger.warn(
						{
							err: cleanupErr,
							trackingThreadId
						},
						'Failed to cleanup tracking thread after draft creation error'
					);
				});
		}

		await interaction.editReply({
			content: `Failed to create event draft. Please contact a TECH member with the following: requestId=${context.requestId} discordMessageId=${interaction.id}`
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

function buildTrackingThreadName({ eventName, tierName }: { eventName: string; tierName: string }) {
	const safeEventName = eventName.slice(0, 64);
	return `${tierName} | ${safeEventName}`;
}

function buildParentVoiceChannelName({ tierName, eventName }: { tierName: string; eventName: string }) {
	return `${tierName} | ${eventName}`.slice(0, 100);
}

async function resolvePrimaryVoiceChannel(guild: Guild, channelId: string) {
	const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
	if (!channel || !channel.isVoiceBased()) {
		return null;
	}

	return channel;
}

async function createTrackingThread({
	channel,
	eventName,
	tierName,
	issuerTag,
	issuerDiscordUserId
}: {
	channel: TextChannel | ForumChannel;
	eventName: string;
	tierName: string;
	issuerTag: string;
	issuerDiscordUserId: string;
}): Promise<ThreadChannel> {
	const threadName = buildTrackingThreadName({ eventName, tierName });
	const reason = `Event draft created by ${issuerTag} (${issuerDiscordUserId})`;

	if (channel.type === ChannelType.GuildForum) {
		return channel.threads.create({
			name: threadName,
			autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
			message: {
				content: `Initializing event thread for **${tierName} | ${eventName}**...`
			},
			reason
		});
	}

	return channel.threads.create({
		name: threadName,
		autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
		reason
	});
}

async function sendConfirmationToVoiceChat({
	guild,
	primaryVoiceChannelId,
	confirmationPayload,
	logger
}: {
	guild: Guild;
	primaryVoiceChannelId: string;
	confirmationPayload: ReturnType<typeof buildEventStartConfirmationPayload>;
	logger: ExecutionContext['logger'];
}): Promise<Message | null> {
	const channel = guild.channels.cache.get(primaryVoiceChannelId) ?? (await guild.channels.fetch(primaryVoiceChannelId).catch(() => null));
	if (!channel || !('send' in channel) || typeof channel.send !== 'function') {
		logger.warn(
			{
				primaryVoiceChannelId
			},
			'Primary voice channel does not support chat message send for event confirmation'
		);
		return null;
	}

	const message = await channel.send(confirmationPayload).catch((error: unknown) => {
		logger.warn(
			{
				err: error,
				primaryVoiceChannelId
			},
			'Failed to post start confirmation in primary voice channel chat'
		);
		return null;
	});

	return message;
}
