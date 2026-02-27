import type { Guild } from 'discord.js';

import { ENV_DISCORD } from '../../../../config/env';
import { DivisionKind } from '@prisma/client';
import { container } from '@sapphire/framework';

type GetEligibleAuxMemberIdsParams = {
	guild: Guild;
};

export async function getEligibleAuxMemberIds({ guild }: GetEligibleAuxMemberIdsParams) {
	const qualifiedDivisions = await container.utilities.divisionCache.get({
		kinds: [...Object.values(DivisionKind)].filter((kind) => kind !== 'AUXILIARY')
	});
	const qualifiedDiscordRoleIds = qualifiedDivisions
		.map((division) => division.discordRoleId)
		.filter((roleId): roleId is string => roleId !== null);

	const eligibleMemberIds = new Set<string>();

	for (const voiceState of guild.voiceStates.cache.values()) {
		if (!voiceState.channelId) {
			continue;
		}

		const member = voiceState.member;
		if (!member) {
			continue;
		}

		if (!member.roles.cache.has(ENV_DISCORD.AUX_ROLE_ID)) {
			continue;
		}

		if (member.voice.selfMute || member.voice.serverMute) {
			continue;
		}

		let otherQualifiedMembersInVc = 0;
		for (const [otherMemberId, otherMember] of member.voice.channel!.members) {
			if (otherMemberId === member.id) {
				continue;
			}

			if (otherMember.voice.selfMute || otherMember.voice.serverMute) {
				continue;
			}

			if (!qualifiedDiscordRoleIds.some((roleId) => otherMember.roles.cache.has(roleId))) {
				continue;
			}

			++otherQualifiedMembersInVc;
		}

		if (otherQualifiedMembersInVc >= ENV_DISCORD.AUX_VC_MIN_OTHER_QUALIFIED_MEMBERS) eligibleMemberIds.add(member.id);
	}

	return eligibleMemberIds;
}
