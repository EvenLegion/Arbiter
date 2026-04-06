import { z } from 'zod';

import { createCustomIdCodec, joinCustomId } from '../../../discord/interactions/customId';

export type ParsedMeritRankListButton = {
	action: 'page';
	page: number;
};

const PAGE_SCHEMA = z.coerce.number().int().positive();

export function parseMeritRankListButtonCustomId({ customId }: { customId: string }): ParsedMeritRankListButton | null {
	return MERIT_RANK_LIST_PAGE_BUTTON_CODEC.parse(customId);
}

export function buildMeritRankListPageButtonId({ page }: { page: number }) {
	return MERIT_RANK_LIST_PAGE_BUTTON_CODEC.build({
		page
	});
}

export function buildMeritRankListPageIndicatorButtonId({ page }: { page: number }) {
	return joinCustomId(['merit', 'rank-list', 'page-indicator', page]);
}

const MERIT_RANK_LIST_PAGE_BUTTON_CODEC = createCustomIdCodec<
	ParsedMeritRankListButton,
	{
		page: number;
	}
>({
	prefix: ['merit', 'rank-list', 'page'],
	parseParts: ([rawPage]) => {
		const parsedPage = PAGE_SCHEMA.safeParse(rawPage);
		if (!parsedPage.success) {
			return null;
		}

		return {
			action: 'page',
			page: parsedPage.data
		};
	},
	buildParts: ({ page }) => [page]
});
