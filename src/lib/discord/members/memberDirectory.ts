import type { Guild, GuildMember } from 'discord.js';

import { getGuildMember } from '../guild/guildMembers';

type MemberAutocompleteChoice = {
	name: string;
	value: string;
};

type GetGuildMemberByDiscordUserIdParams = {
	guild: Guild;
	discordUserId: string;
	includeBots?: boolean;
};

type FindGuildMemberByInputParams = {
	guild: Guild;
	input: string;
	includeBots?: boolean;
};

type BuildGuildMemberAutocompleteChoicesParams = {
	guild: Guild;
	query: string;
	includeBots?: boolean;
	limit?: number;
};

export const DEFAULT_AUTOCOMPLETE_LIMIT = 25;

export function parseDiscordUserIdInput(value: string | null): string | undefined {
	if (!value) {
		return undefined;
	}

	const trimmed = value.trim();
	const mentionMatch = /^<@!?(\d+)>$/.exec(trimmed);
	if (mentionMatch) {
		return mentionMatch[1];
	}

	return /^\d{17,20}$/.test(trimmed) ? trimmed : undefined;
}

export async function getGuildMemberByDiscordUserId({
	guild,
	discordUserId,
	includeBots = false
}: GetGuildMemberByDiscordUserIdParams): Promise<GuildMember | null> {
	const member = await getGuildMember({
		guild,
		discordUserId
	});
	if (!member) {
		return null;
	}

	return includeBots || !member.user.bot ? member : null;
}

export async function findGuildMemberByInput({ guild, input, includeBots = false }: FindGuildMemberByInputParams): Promise<GuildMember | null> {
	const trimmedInput = input.trim();
	if (trimmedInput.length === 0) {
		return null;
	}

	const parsedDiscordUserId = parseDiscordUserIdInput(trimmedInput);
	if (parsedDiscordUserId) {
		return getGuildMemberByDiscordUserId({
			guild,
			discordUserId: parsedDiscordUserId,
			includeBots
		});
	}

	const normalizedQuery = normalizeMemberDirectoryQuery(trimmedInput);
	const cachedMatch = findUniqueMemberMatch({
		members: guild.members.cache.values(),
		normalizedQuery,
		includeBots
	});
	if (cachedMatch) {
		return cachedMatch;
	}

	const fetchedMembers = await guild.members.fetch({
		query: trimmedInput,
		limit: DEFAULT_AUTOCOMPLETE_LIMIT
	});
	const fetchedMatch = findUniqueMemberMatch({
		members: mergeMembers(guild.members.cache.values(), fetchedMembers.values()),
		normalizedQuery,
		includeBots
	});
	if (fetchedMatch) {
		return fetchedMatch;
	}

	const allMembers = await guild.members.fetch();
	return findUniqueMemberMatch({
		members: mergeMembers(guild.members.cache.values(), allMembers.values()),
		normalizedQuery,
		includeBots
	});
}

export async function buildGuildMemberAutocompleteChoices({
	guild,
	query,
	includeBots = false,
	limit = DEFAULT_AUTOCOMPLETE_LIMIT
}: BuildGuildMemberAutocompleteChoicesParams): Promise<MemberAutocompleteChoice[]> {
	const normalizedQuery = normalizeMemberDirectoryQuery(query);
	const parsedDiscordUserId = parseDiscordUserIdInput(query);
	if (parsedDiscordUserId) {
		const member = await getGuildMemberByDiscordUserId({
			guild,
			discordUserId: parsedDiscordUserId,
			includeBots
		});
		if (!member) {
			return [];
		}

		return [toAutocompleteChoice(member)];
	}

	const cachedMatches = getRankedMembers({
		members: guild.members.cache.values(),
		normalizedQuery,
		includeBots
	});

	const members =
		cachedMatches.length > 0 || normalizedQuery.length === 0
			? cachedMatches
			: await getAutocompleteFallbackMembers({
					guild,
					query,
					normalizedQuery,
					includeBots,
					limit
				});

	return members.slice(0, limit).map(toAutocompleteChoice);
}

function normalizeMemberDirectoryQuery(value: string) {
	return value.trim().toLowerCase();
}

function getMemberDirectorySearchKeys(member: GuildMember) {
	return [
		...new Set(
			[member.displayName, member.nickname ?? '', member.user.globalName ?? '', member.user.username]
				.map((value) => value.trim())
				.filter(Boolean)
		)
	];
}

function mergeMembers(...collections: Iterable<GuildMember>[]) {
	const membersById = new Map<string, GuildMember>();

	for (const collection of collections) {
		for (const member of collection) {
			membersById.set(member.id, member);
		}
	}

	return membersById.values();
}

async function getAutocompleteFallbackMembers({
	guild,
	query,
	normalizedQuery,
	includeBots,
	limit
}: {
	guild: Guild;
	query: string;
	normalizedQuery: string;
	includeBots: boolean;
	limit: number;
}) {
	const queriedMembers = await guild.members.fetch({
		query: query.trim(),
		limit
	});
	const queriedMatches = getRankedMembers({
		members: mergeMembers(guild.members.cache.values(), queriedMembers.values()),
		normalizedQuery,
		includeBots
	});
	if (queriedMatches.length > 0) {
		return queriedMatches;
	}

	const allMembers = await guild.members.fetch();
	return getRankedMembers({
		members: mergeMembers(guild.members.cache.values(), allMembers.values()),
		normalizedQuery,
		includeBots
	});
}

function findUniqueMemberMatch({
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

function getRankedMembers({
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

function toAutocompleteChoice(member: GuildMember): MemberAutocompleteChoice {
	return {
		name: member.displayName.slice(0, 100),
		value: member.id
	};
}
