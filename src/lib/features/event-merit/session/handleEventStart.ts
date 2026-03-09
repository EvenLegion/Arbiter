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
	findFirstEventTier,
	upsertEventSessionChannel,
	upsertEventSessionMessageRef
} from '../../../../integrations/prisma';
import type { ExecutionContext } from '../../../logging/executionContext';
import { buildEventTrackingSummaryPayload } from '../ui/buildEventTrackingSummaryPayload';

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

	const eventTier = await findFirstEventTier({
		where: {
			id: parsedEventTierId.data,
			isActive: true
		}
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

		const summaryMessage = await thread.send(
			buildEventTrackingSummaryPayload({
				eventSessionId: eventSession.id,
				eventName: eventSession.name,
				tierName: eventTier.name,
				tierMeritAmount: eventTier.meritType.meritAmount,
				hostDiscordUserId: issuer.id,
				trackedChannelIds: [primaryVoiceChannelId],
				trackingThreadId: thread.id,
				state: EventSessionState.DRAFT
			})
		);
		const parentVoiceSummaryMessage = await postTrackingSummaryToParentVoiceChat({
			primaryVoiceChannel,
			eventSessionId: eventSession.id,
			eventName: eventSession.name,
			tierName: eventTier.name,
			tierMeritAmount: eventTier.meritType.meritAmount,
			hostDiscordUserId: issuer.id,
			trackedChannelIds: [primaryVoiceChannelId],
			trackingThreadId: thread.id,
			logger
		});
		await thread.send({
			content: `Event draft **${eventSession.name}** created by <@${interaction.user.id}>.`
		});

		await upsertEventSessionMessageRef({
			eventSessionId: eventSession.id,
			kind: EventSessionMessageKind.TRACKING_SUMMARY,
			channelId: summaryMessage.channelId,
			messageId: summaryMessage.id
		});
		if (parentVoiceSummaryMessage) {
			await upsertEventSessionMessageRef({
				eventSessionId: eventSession.id,
				kind: EventSessionMessageKind.TRACKING_SUMMARY_PARENT_VC,
				channelId: parentVoiceSummaryMessage.channelId,
				messageId: parentVoiceSummaryMessage.id
			});
		}

		await interaction.deleteReply().catch(() => null);

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
	return container.utilities.guild
		.getVoiceBasedChannelOrThrow({
			guild,
			channelId
		})
		.catch(() => null);
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

async function postTrackingSummaryToParentVoiceChat({
	primaryVoiceChannel,
	eventSessionId,
	eventName,
	tierName,
	tierMeritAmount,
	hostDiscordUserId,
	trackedChannelIds,
	trackingThreadId,
	logger
}: {
	primaryVoiceChannel: Awaited<ReturnType<typeof resolvePrimaryVoiceChannel>>;
	eventSessionId: number;
	eventName: string;
	tierName: string;
	tierMeritAmount: number;
	hostDiscordUserId: string;
	trackedChannelIds: string[];
	trackingThreadId: string | null;
	logger: ExecutionContext['logger'];
}): Promise<Message | null> {
	if (!primaryVoiceChannel || !('send' in primaryVoiceChannel) || typeof primaryVoiceChannel.send !== 'function') {
		logger.warn(
			{
				eventSessionId,
				primaryVoiceChannelId: trackedChannelIds[0] ?? null
			},
			'Primary VC chat unavailable; skipping parent VC summary post'
		);
		return null;
	}

	return primaryVoiceChannel
		.send(
			buildEventTrackingSummaryPayload({
				eventSessionId,
				eventName,
				tierName,
				tierMeritAmount,
				hostDiscordUserId,
				trackedChannelIds,
				trackingThreadId,
				state: EventSessionState.DRAFT
			})
		)
		.catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					eventSessionId,
					primaryVoiceChannelId: trackedChannelIds[0] ?? null
				},
				'Failed to post tracking summary in parent VC chat'
			);
			return null;
		});
}
