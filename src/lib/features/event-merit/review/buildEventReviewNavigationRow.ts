import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import { buildEventReviewPageButtonId, buildEventReviewPageIndicatorButtonId } from './parseEventReviewButton';

export function buildEventReviewNavigationRow({ eventSessionId, page, totalPages }: { eventSessionId: number; page: number; totalPages: number }) {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(buildEventReviewPageButtonId({ eventSessionId, page: Math.max(1, page - 1), source: 'prev' }))
			.setLabel('Prev')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page <= 1),
		new ButtonBuilder()
			.setCustomId(buildEventReviewPageIndicatorButtonId({ eventSessionId, page }))
			.setLabel(`Page ${page}/${totalPages}`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
		new ButtonBuilder()
			.setCustomId(buildEventReviewPageButtonId({ eventSessionId, page: Math.min(totalPages, page + 1), source: 'next' }))
			.setLabel('Next')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page >= totalPages)
	);
}
