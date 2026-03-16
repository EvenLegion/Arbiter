import type { GuildMember } from 'discord.js';

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

export function normalizeMemberDirectoryQuery(value: string) {
	return value.trim().toLowerCase();
}

export function getMemberDirectorySearchKeys(member: GuildMember) {
	return [
		...new Set(
			[member.displayName, member.nickname ?? '', member.user.globalName ?? '', member.user.username]
				.map((value) => value.trim())
				.filter(Boolean)
		)
	];
}

export function mergeMembers(...collections: Iterable<GuildMember>[]) {
	const membersById = new Map<string, GuildMember>();

	for (const collection of collections) {
		for (const member of collection) {
			membersById.set(member.id, member);
		}
	}

	return membersById.values();
}
