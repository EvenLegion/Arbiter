import { EmbedBuilder } from 'discord.js';

import type { GuildMemberSyncResult } from '../../../services/guild-member-sync/guildMemberSyncService';

export function buildGuildMemberSyncPayload({ result }: { result: Extract<GuildMemberSyncResult, { kind: 'completed' }> }) {
	const summaryEmbed = new EmbedBuilder()
		.setTitle('Guild Member Sync Complete')
		.setColor(result.failedMembers.length > 0 ? 0xf59e0b : 0x22c55e)
		.addFields(
			{ name: 'Total Members', value: String(result.totalMembers), inline: true },
			{ name: 'Bot Members Skipped', value: String(result.botMembersSkipped), inline: true },
			{ name: 'Users Upserted', value: String(result.usersUpserted), inline: true },
			{ name: 'Memberships Synced', value: String(result.membershipSyncSucceeded), inline: true },
			{ name: 'Nicknames Computed', value: String(result.nicknameComputed), inline: true },
			{ name: 'Nicknames Updated', value: String(result.nicknameUpdated), inline: true },
			{ name: 'Nicknames Unchanged', value: String(result.nicknameUnchanged), inline: true },
			{ name: 'Failed Members', value: String(result.failedMembers.length), inline: true }
		)
		.setTimestamp();

	if (result.failedMembers.length > 0) {
		summaryEmbed.addFields({
			name: 'Failure Preview',
			value: result.failedMembers
				.slice(0, 10)
				.map((failedMember) => {
					const dbUserPart = failedMember.dbUserId ? ` dbUserId=${failedMember.dbUserId}` : '';
					return `- ${failedMember.discordUsername} (${failedMember.discordUserId})${dbUserPart}`;
				})
				.join('\n')
		});
	}

	return {
		embeds: [summaryEmbed]
	};
}
