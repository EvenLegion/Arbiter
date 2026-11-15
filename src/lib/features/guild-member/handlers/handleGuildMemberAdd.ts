import type { GuildMember } from 'discord.js';

import { ENV_DISCORD } from '../../../../config/env/discord';
import { userRepository } from '../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../logging/executionContext';
import { createMeritBadgeSyncRuntime } from '../../../services/merit-badge/createMeritBadgeSyncRuntime';
import { buildWelcomeMessage } from '../welcome/buildWelcomeMessage';

type HandleGuildMemberAddParams = {
	member: GuildMember;
	context: ExecutionContext;
};

export async function handleGuildMemberAdd({ member, context }: HandleGuildMemberAddParams) {
	const caller = 'handleGuildMemberAdd';
	const logger = context.logger.child({ caller });

	logger.trace(
		{
			'ENV_DISCORD.WELCOME_CHANNEL_ID': ENV_DISCORD.WELCOME_CHANNEL_ID,
			memberId: member.user.id,
			guildId: member.guild.id
		},
		'guildMemberAdd event received'
	);

	try {
		await userRepository.upsert({
			discordUserId: member.user.id,
			discordUsername: member.user.username,
			discordNickname: member.nickname ?? member.user.globalName ?? member.user.username,
			discordAvatarUrl: member.user.displayAvatarURL()
		});
	} catch (err) {
		logger.error(
			{
				memberId: member.user.id,
				guildId: member.guild.id,
				err
			},
			'failed to upsert user'
		);
	}

	await restoreMeritBadge({ member, context, logger });

	const message = buildWelcomeMessage({
		guildName: member.guild.name,
		discordUserId: member.user.id,
		userAvatarUrl: member.user.displayAvatarURL(),
		rulesChannelId: ENV_DISCORD.WELCOME_RULES_CHANNEL_ID,
		recruitmentChannelId: ENV_DISCORD.WELCOME_RECRUITMENT_CHANNEL_ID,
		charterChannelId: ENV_DISCORD.WELCOME_CHARTER_CHANNEL_ID,
		newPlayersChannelId: ENV_DISCORD.WELCOME_NEW_PLAYERS_CHANNEL_ID
	});

	const channel = await member.guild.channels.fetch(ENV_DISCORD.WELCOME_CHANNEL_ID);
	if (!channel?.isTextBased()) {
		logger.error(
			{
				channelId: ENV_DISCORD.WELCOME_CHANNEL_ID
			},
			'welcome channel was not found or is not text-based'
		);
		return;
	}

	await channel.send({ content: message.content, embeds: message.embeds });

	logger.info(
		{
			discordUserId: member.user.id,
			discordUsername: member.user.username,
			discordNickname: member.nickname ?? member.user.globalName ?? member.user.username
		},
		'welcome message sent'
	);
}

/** Gives a returning member back the badge for their stored total. Never blocks the welcome. */
async function restoreMeritBadge({
	member,
	context,
	logger
}: {
	member: GuildMember;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
}) {
	if (member.guild.id !== ENV_DISCORD.DISCORD_GUILD_ID) {
		return;
	}

	try {
		// The runtime logs the outcome; no total override, so the total is read fresh.
		await createMeritBadgeSyncRuntime({
			guild: member.guild,
			context,
			auditReason: 'Merit badge restore after member rejoined'
		}).syncMember({
			discordUserId: member.user.id
		});
	} catch (error) {
		logger.error(
			{
				discordUserId: member.user.id,
				errorName: error instanceof Error ? error.name : undefined
			},
			'Failed to restore merit badge for joining member'
		);
	}
}
