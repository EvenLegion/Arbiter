import {
	ChannelType,
	EmbedBuilder,
	MessageFlags,
	TextChannel,
	ThreadAutoArchiveDuration,
	type ActionRowBuilder,
	type ButtonBuilder,
	type ChatInputCommandInteraction,
	type ForumChannel,
	type Guild
} from 'discord.js';
import { container } from '@sapphire/framework';

import { ENV_DISCORD } from '../../../config/env';
import { createNameChangeRequest, saveNameChangeRequestReviewThread } from '../../../integrations/prisma';
import type { ExecutionContext } from '../../logging/executionContext';
import { buildNameChangeReviewActionRow } from './nameChangeReviewButtons';

type HandleNameChangeTicketParams = {
	interaction: ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handleNameChangeTicket({ interaction, context }: HandleNameChangeTicketParams) {
	const caller = 'handleNameChangeTicket';
	const logger = context.logger.child({ caller });

	const requestedName = interaction.options.getString('requested_name', true).trim();
	const reason = interaction.options.getString('reason', true).trim();
	if (!requestedName || !reason) {
		await interaction.reply({
			content: 'Requested name and reason are required.',
			flags: MessageFlags.Ephemeral
		});
		return;
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	let guild: Guild;
	try {
		guild = await container.utilities.guild.getOrThrow();
	} catch (error) {
		logger.error(
			{
				err: error
			},
			'Failed to resolve configured guild while handling name change ticket'
		);
		await interaction.editReply({
			content: `Could not resolve configured guild. Please contact TECH with: requestId=${context.requestId}`
		});
		return;
	}

	const requesterDbUser = await container.utilities.userDirectory.getOrThrow({ discordUserId: interaction.user.id }).catch((error: unknown) => {
		logger.error(
			{
				err: error,
				discordUserId: interaction.user.id
			},
			'Failed to resolve requester user in database for name change ticket'
		);
		return null;
	});
	if (!requesterDbUser) {
		await interaction.editReply({
			content: `User not found in database. Please contact staff with: requestId=${context.requestId}`
		});
		return;
	}

	const currentName = requesterDbUser.discordNickname || requesterDbUser.discordUsername || interaction.user.username;
	const request = await createNameChangeRequest({
		requesterDbUserId: requesterDbUser.id,
		currentName,
		requestedName,
		reason
	}).catch((error: unknown) => {
		logger.error(
			{
				err: error,
				requesterDbUserId: requesterDbUser.id
			},
			'Failed to create name change request'
		);
		return null;
	});
	if (!request) {
		await interaction.editReply({
			content: `Failed to create name change request. Please contact staff with: requestId=${context.requestId}`
		});
		return;
	}

	const botRequestsChannel = await resolveBotRequestsChannel(guild);
	if (!botRequestsChannel) {
		await interaction.editReply({
			content: 'Requests channel could not be resolved or is not thread-capable.'
		});
		return;
	}

	const initialEmbed = new EmbedBuilder()
		.setTitle('Name Change Request')
		.setColor(0xf59e0b)
		.addFields(
			{
				name: 'Requester',
				value: `<@${interaction.user.id}>`,
				inline: false
			},
			{
				name: 'Current Name',
				value: trimForEmbed(currentName, 100),
				inline: false
			},
			{
				name: 'Requested Name',
				value: trimForEmbed(requestedName, 100),
				inline: false
			},
			{
				name: 'Reason',
				value: trimForEmbed(reason, 1_000),
				inline: false
			},
			{
				name: 'Status',
				value: 'Pending',
				inline: true
			}
		)
		.setFooter({
			text: `Request ID: ${request.id}`
		})
		.setTimestamp(new Date());

	const threadResult = await createReviewThread({
		channel: botRequestsChannel,
		requestedName,
		requestId: request.id,
		requesterTag: interaction.user.tag,
		requesterDiscordUserId: interaction.user.id,
		embed: initialEmbed,
		components: [buildNameChangeReviewActionRow({ requestId: request.id })]
	}).catch((error: unknown) => {
		logger.error(
			{
				err: error,
				requestId: request.id,
				botRequestsChannelId: ENV_DISCORD.BOT_REQUESTS_CHANNEL_ID
			},
			'Failed to create review thread for name change request'
		);
		return null;
	});
	if (!threadResult) {
		await interaction.editReply({
			content: `Request created but failed to create review thread. Please contact staff with: requestId=${request.id}`
		});
		return;
	}

	await saveNameChangeRequestReviewThread({
		requestId: request.id,
		reviewThreadId: threadResult.thread.id
	});

	logger.info(
		{
			requestId: request.id,
			requesterDiscordUserId: interaction.user.id,
			requestedName,
			reviewThreadId: threadResult.thread.id
		},
		'Created name change ticket'
	);

	await interaction.editReply({
		content: `Name change request created.\nReview thread: <#${threadResult.thread.id}>`
	});
}

async function resolveBotRequestsChannel(guild: Guild): Promise<ForumChannel | TextChannel | null> {
	const channel =
		guild.channels.cache.get(ENV_DISCORD.BOT_REQUESTS_CHANNEL_ID) ??
		(await guild.channels.fetch(ENV_DISCORD.BOT_REQUESTS_CHANNEL_ID).catch(() => null));
	if (!channel) {
		return null;
	}

	if (channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildText) {
		return channel;
	}

	return null;
}

async function createReviewThread({
	channel,
	requestedName,
	requestId,
	requesterTag,
	requesterDiscordUserId,
	embed,
	components
}: {
	channel: ForumChannel | TextChannel;
	requestedName: string;
	requestId: number;
	requesterTag: string;
	requesterDiscordUserId: string;
	embed: EmbedBuilder;
	components: ActionRowBuilder<ButtonBuilder>[];
}) {
	const threadName = `Name Change Request - ${requestedName}`.slice(0, 100);
	const reason = `Name change request review for request ${requestId} by ${requesterTag} (${requesterDiscordUserId})`;
	const staffRoleIds = getStaffRoleIds();
	const mentionContent = staffRoleIds.map((roleId) => `<@&${roleId}>`).join(' ');

	if (channel.type === ChannelType.GuildForum) {
		const thread = await channel.threads.create({
			name: threadName,
			autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
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
		await thread.fetchStarterMessage().catch(() => null);
		return {
			thread
		};
	}

	const thread = await channel.threads.create({
		name: threadName,
		autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
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

	return {
		thread
	};
}

function trimForEmbed(value: string, maxLength: number) {
	const trimmed = value.trim();
	if (trimmed.length <= maxLength) {
		return trimmed;
	}

	return `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
}

function getStaffRoleIds() {
	return [...new Set([ENV_DISCORD.SEC_ROLE_ID, ENV_DISCORD.CMDR_ROLE_ID, ENV_DISCORD.TIR_ROLE_ID])];
}
