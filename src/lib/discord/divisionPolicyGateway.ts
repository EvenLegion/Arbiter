import type { Division, DivisionKind } from '@prisma/client';
import type { GuildMember } from 'discord.js';

import { getCachedDivisionByCode, getCachedDivisionByDbId, getCachedDivisionByDiscordRoleId, listCachedDivisions } from './divisionCacheGateway';

export function memberHasDivisionKindRole({ member, requiredRoleKinds }: { member: GuildMember; requiredRoleKinds: DivisionKind[] }) {
	if (requiredRoleKinds.length === 0) {
		return Promise.resolve(true);
	}

	return listCachedDivisions({
		kinds: requiredRoleKinds
	}).then((divisions) => {
		const requiredRoleIds = divisions.map((division) => division.discordRoleId).filter((roleId): roleId is string => Boolean(roleId));
		return requiredRoleIds.some((roleId) => member.roles.cache.has(roleId));
	});
}

export function memberHasDivision({
	member,
	divisionDiscordRoleId,
	divisionDbId,
	divisionCode
}: {
	member: GuildMember;
	divisionDiscordRoleId?: string;
	divisionDbId?: number;
	divisionCode?: string;
}) {
	return resolveDivision({
		divisionDiscordRoleId,
		divisionDbId,
		divisionCode
	}).then((division) => {
		if (!division) {
			throw new Error(
				`Division not found: divisionDbId=${divisionDbId}, divisionDiscordRoleId=${divisionDiscordRoleId}, divisionCode=${divisionCode}`
			);
		}
		if (division.discordRoleId === null) {
			throw new Error(
				`Division has no discord role: divisionDbId=${divisionDbId}, divisionDiscordRoleId=${divisionDiscordRoleId}, divisionCode=${divisionCode}`
			);
		}

		return member.roles.cache.has(division.discordRoleId);
	});
}

async function resolveDivision({
	divisionDiscordRoleId,
	divisionDbId,
	divisionCode
}: {
	divisionDiscordRoleId?: string;
	divisionDbId?: number;
	divisionCode?: string;
}): Promise<Division | undefined> {
	if (!divisionDiscordRoleId && !divisionCode && !divisionDbId) {
		throw new Error('Either divisionDiscordRoleId, divisionCode, or divisionDbId must be provided');
	}

	if (divisionDbId) {
		return getCachedDivisionByDbId(divisionDbId);
	}
	if (divisionDiscordRoleId) {
		return getCachedDivisionByDiscordRoleId(divisionDiscordRoleId);
	}
	if (divisionCode) {
		return getCachedDivisionByCode(divisionCode);
	}

	return undefined;
}
