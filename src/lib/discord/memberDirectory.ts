import type { Guild, GuildMember } from 'discord.js';

import { DEFAULT_AUTOCOMPLETE_LIMIT, mergeMembers, normalizeMemberDirectoryQuery, parseDiscordUserIdInput } from './memberDirectoryCore';
import { findUniqueMemberMatch, getRankedMembers } from './memberDirectoryMatching';

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
export { parseDiscordUserIdInput } from './memberDirectoryCore';

export async function getGuildMemberByDiscordUserId({
	guild,
	discordUserId,
	includeBots = false
}: GetGuildMemberByDiscordUserIdParams): Promise<GuildMember | null> {
	const member = guild.members.cache.get(discordUserId) ?? (await guild.members.fetch(discordUserId).catch(() => null));
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
	const cachedMatches = findUniqueMemberMatch({
		members: guild.members.cache.values(),
		normalizedQuery,
		includeBots
	});
	if (cachedMatches) {
		return cachedMatches;
	}

	const fetchedMembers = await guild.members.fetch({
		query: trimmedInput,
		limit: DEFAULT_AUTOCOMPLETE_LIMIT
	});
	return findUniqueMemberMatch({
		members: mergeMembers(guild.members.cache.values(), fetchedMembers.values()),
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
			: getRankedMembers({
					members: mergeMembers(
						guild.members.cache.values(),
						(
							await guild.members.fetch({
								query: query.trim(),
								limit
							})
						).values()
					),
					normalizedQuery,
					includeBots
				});

	return members.slice(0, limit).map(toAutocompleteChoice);
}

function toAutocompleteChoice(member: GuildMember): MemberAutocompleteChoice {
	return {
		name: member.displayName.slice(0, 100),
		value: member.id
	};
}
