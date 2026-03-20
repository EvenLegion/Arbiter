import {
	ChannelType,
	EmbedBuilder,
	ThreadAutoArchiveDuration,
	type ActionRowBuilder,
	type ButtonBuilder,
	type ForumChannel,
	type Guild,
	type TextChannel
} from 'discord.js';

import { getNameChangeReviewStaffRoleIds, resolveBotRequestsChannel, type NameChangeReviewLogger } from './nameChangeReviewThreadUtils';

export function createNameChangeReviewThread({
	guild,
	logger,
	buildReviewEmbed,
	buildReviewActionRow
}: {
	guild: Guild;
	logger: NameChangeReviewLogger & {
		info: (...values: readonly unknown[]) => void;
	};
	buildReviewEmbed: (params: {
		requestId: number;
		requesterDiscordUserId: string;
		currentName: string;
		requestedName: string;
		reason: string;
	}) => EmbedBuilder;
	buildReviewActionRow: (params: { requestId: number }) => ActionRowBuilder<ButtonBuilder>;
}) {
	return async (payload: {
		requestId: number;
		requesterDiscordUserId: string;
		requesterTag: string;
		currentName: string;
		requestedName: string;
		reason: string;
	}) => {
		logger.info(
			{
				nameChangeRequestId: payload.requestId,
				requesterDiscordUserId: payload.requesterDiscordUserId,
				requestedName: payload.requestedName
			},
			'name_change.review_thread.creating'
		);

		const botRequestsChannel = await resolveBotRequestsChannel(guild, logger);
		if (!botRequestsChannel) {
			logger.error(
				{
					nameChangeRequestId: payload.requestId,
					guildId: guild.id
				},
				'name_change.review_thread.bot_requests_channel_missing'
			);
			return null;
		}

		try {
			const thread = await createReviewThread({
				channel: botRequestsChannel,
				logger,
				requestedName: payload.requestedName,
				requestId: payload.requestId,
				requesterTag: payload.requesterTag,
				requesterDiscordUserId: payload.requesterDiscordUserId,
				embed: buildReviewEmbed({
					requestId: payload.requestId,
					requesterDiscordUserId: payload.requesterDiscordUserId,
					currentName: payload.currentName,
					requestedName: payload.requestedName,
					reason: payload.reason
				}),
				components: [buildReviewActionRow({ requestId: payload.requestId })]
			});

			logger.info(
				{
					nameChangeRequestId: payload.requestId,
					requesterDiscordUserId: payload.requesterDiscordUserId,
					reviewThreadId: thread.id,
					botRequestsChannelId: botRequestsChannel.id
				},
				'name_change.review_thread.created'
			);

			return {
				reviewThreadId: thread.id
			};
		} catch (error) {
			logger.error(
				{
					err: error,
					nameChangeRequestId: payload.requestId,
					requesterDiscordUserId: payload.requesterDiscordUserId,
					requestedName: payload.requestedName
				},
				'name_change.review_thread.failed'
			);
			throw error;
		}
	};
}

async function createReviewThread({
	channel,
	logger,
	requestedName,
	requestId,
	requesterTag,
	requesterDiscordUserId,
	embed,
	components
}: {
	channel: ForumChannel | TextChannel;
	logger: NameChangeReviewLogger;
	requestedName: string;
	requestId: number;
	requesterTag: string;
	requesterDiscordUserId: string;
	embed: EmbedBuilder;
	components: ActionRowBuilder<ButtonBuilder>[];
}) {
	const threadName = `Name Change Request - ${requestedName}`.slice(0, 100);
	const reason = `Name change request review for request ${requestId} by ${requesterTag} (${requesterDiscordUserId})`;
	const staffRoleIds = getNameChangeReviewStaffRoleIds();
	const mentionContent = staffRoleIds.map((roleId) => `<@&${roleId}>`).join(' ');

	if (channel.type === ChannelType.GuildForum) {
		const thread = await channel.threads.create({
			name: threadName,
			autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
			message: {
				content: mentionContent,
				embeds: [embed],
				components,
				allowedMentions: {
					roles: staffRoleIds
				}
			},
			reason
		});
		await thread.fetchStarterMessage().catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					nameChangeRequestId: requestId,
					threadId: thread.id
				},
				'Failed to fetch starter message for created name change review thread'
			);
			return null;
		});
		return thread;
	}

	const thread = await channel.threads.create({
		name: threadName,
		autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
		reason
	});
	await thread.send({
		content: mentionContent,
		embeds: [embed],
		components,
		allowedMentions: {
			roles: staffRoleIds
		}
	});

	return thread;
}
