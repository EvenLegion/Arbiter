import type { GuildMember } from 'discord.js';

import { getMemberDirectorySearchKeys, normalizeMemberDirectoryQuery } from './memberDirectoryCore';

export function findUniqueMemberMatch({
	members,
	normalizedQuery,
	includeBots
}: {
	members: Iterable<GuildMember>;
	normalizedQuery: string;
	includeBots: boolean;
}) {
	const exactMatches = collectMatchingMembers({
		members,
		normalizedQuery,
		includeBots,
		matchKind: 'exact'
	});
	if (exactMatches.length === 1) {
		return exactMatches[0];
	}
	if (exactMatches.length > 1) {
		return null;
	}

	const looseMatches = collectMatchingMembers({
		members,
		normalizedQuery,
		includeBots,
		matchKind: 'loose'
	});
	return looseMatches.length === 1 ? looseMatches[0] : null;
}

export function getRankedMembers({
	members,
	normalizedQuery,
	includeBots
}: {
	members: Iterable<GuildMember>;
	normalizedQuery: string;
	includeBots: boolean;
}) {
	return [...members]
		.filter((member) => includeBots || !member.user.bot)
		.filter((member) => normalizedQuery.length === 0 || getMemberDirectoryMatch(member, normalizedQuery) !== 'none')
		.sort((left, right) => compareMembersByQuery({ left, right, normalizedQuery }));
}

function collectMatchingMembers({
	members,
	normalizedQuery,
	includeBots,
	matchKind
}: {
	members: Iterable<GuildMember>;
	normalizedQuery: string;
	includeBots: boolean;
	matchKind: 'exact' | 'loose';
}) {
	return [...members].filter((member) => {
		if (!includeBots && member.user.bot) {
			return false;
		}

		const match = getMemberDirectoryMatch(member, normalizedQuery);
		return match === matchKind;
	});
}

function compareMembersByQuery({ left, right, normalizedQuery }: { left: GuildMember; right: GuildMember; normalizedQuery: string }) {
	if (normalizedQuery.length === 0) {
		return left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id);
	}

	return (
		getMemberQueryRank(left, normalizedQuery) - getMemberQueryRank(right, normalizedQuery) ||
		left.displayName.localeCompare(right.displayName) ||
		left.id.localeCompare(right.id)
	);
}

function getMemberQueryRank(member: GuildMember, normalizedQuery: string) {
	const displayName = normalizeMemberDirectoryQuery(member.displayName);
	const keys = getMemberDirectorySearchKeys(member).map(normalizeMemberDirectoryQuery);

	if (displayName === normalizedQuery) {
		return 0;
	}
	if (keys.some((key) => key === normalizedQuery)) {
		return 1;
	}
	if (displayName.startsWith(normalizedQuery)) {
		return 2;
	}
	if (keys.some((key) => key.startsWith(normalizedQuery))) {
		return 3;
	}
	if (displayName.includes(normalizedQuery)) {
		return 4;
	}
	if (keys.some((key) => key.includes(normalizedQuery))) {
		return 5;
	}
	return 6;
}

function getMemberDirectoryMatch(member: GuildMember, normalizedQuery: string): 'exact' | 'loose' | 'none' {
	const normalizedKeys = getMemberDirectorySearchKeys(member).map(normalizeMemberDirectoryQuery);
	if (normalizedKeys.some((key) => key === normalizedQuery)) {
		return 'exact';
	}
	if (normalizedKeys.some((key) => key.includes(normalizedQuery))) {
		return 'loose';
	}
	return 'none';
}
