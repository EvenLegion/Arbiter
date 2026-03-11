import type { GuildMember } from 'discord.js';

export function resolveDiscordUserIdOptionValue(value: string | null): string | undefined {
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

export function sortMembersByQuery({ a, b, query }: { a: GuildMember; b: GuildMember; query: string }) {
	if (query.length === 0) {
		return a.displayName.localeCompare(b.displayName);
	}

	const aStarts = a.displayName.toLowerCase().startsWith(query);
	const bStarts = b.displayName.toLowerCase().startsWith(query);
	if (aStarts !== bStarts) {
		return aStarts ? -1 : 1;
	}

	return a.displayName.localeCompare(b.displayName);
}
