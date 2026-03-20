import { z } from 'zod';

import { createCustomIdCodec, joinCustomId } from '../../../discord/interactions/customId';

export type ParsedMeritListButton = {
	action: 'page';
	targetDiscordUserId: string;
	page: number;
};

type ParseMeritListButtonCustomIdParams = {
	customId: string;
};

const TARGET_DISCORD_USER_ID_SCHEMA = z.string().regex(/^\d{15,22}$/);
const PAGE_SCHEMA = z.coerce.number().int().positive();

export function parseMeritListButtonCustomId({ customId }: ParseMeritListButtonCustomIdParams): ParsedMeritListButton | null {
	return MERIT_LIST_PAGE_BUTTON_CODEC.parse(customId);
}

export function buildMeritListPageButtonId({ targetDiscordUserId, page }: { targetDiscordUserId: string; page: number }) {
	return MERIT_LIST_PAGE_BUTTON_CODEC.build({
		targetDiscordUserId,
		page
	});
}

export function buildMeritListPageIndicatorButtonId({ targetDiscordUserId, page }: { targetDiscordUserId: string; page: number }) {
	return joinCustomId(['merit', 'list', 'page-indicator', targetDiscordUserId, page]);
}

const MERIT_LIST_PAGE_BUTTON_CODEC = createCustomIdCodec<
	ParsedMeritListButton,
	{
		targetDiscordUserId: string;
		page: number;
	}
>({
	prefix: ['merit', 'list', 'page'],
	parseParts: ([rawTargetDiscordUserId, rawPage]) => {
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
	},
	buildParts: ({ targetDiscordUserId, page }) => [targetDiscordUserId, page]
});
