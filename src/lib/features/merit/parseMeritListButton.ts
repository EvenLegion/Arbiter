import { z } from 'zod';

export type ParsedMeritListButton = {
	action: 'page';
	targetDiscordUserId: string;
	page: number;
};

type ParseMeritListButtonParams = {
	customId: string;
};

const TARGET_DISCORD_USER_ID_SCHEMA = z.string().regex(/^\d{15,22}$/);
const PAGE_SCHEMA = z.coerce.number().int().positive();

export function parseMeritListButton({ customId }: ParseMeritListButtonParams): ParsedMeritListButton | null {
	const [scope, domain, action, ...rest] = customId.split(':');
	if (scope !== 'merit' || domain !== 'list') {
		return null;
	}

	if (action !== 'page') {
		return null;
	}

	const [rawTargetDiscordUserId, rawPage] = rest;
	const parsedTargetDiscordUserId = TARGET_DISCORD_USER_ID_SCHEMA.safeParse(rawTargetDiscordUserId);
	if (!parsedTargetDiscordUserId.success) {
		return null;
	}

	const parsedPage = PAGE_SCHEMA.safeParse(rawPage);
	if (!parsedPage.success) {
		return null;
	}

	return {
		action: 'page',
		targetDiscordUserId: parsedTargetDiscordUserId.data,
		page: parsedPage.data
	};
}
