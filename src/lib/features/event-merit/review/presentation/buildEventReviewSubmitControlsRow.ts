import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import { buildEventReviewSubmitButtonId } from '../buttons/eventReviewButtonProtocol';
import { buildEventReviewNavigationRow } from './buildEventReviewNavigationRow';

export function buildEventReviewSubmitControlsRow({
	eventSessionId,
	page,
	totalPages
}: {
	eventSessionId: number;
	page: number;
	totalPages: number;
}) {
	const navigationRow = buildEventReviewNavigationRow({
		eventSessionId,
		page,
		totalPages
	});

	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		...navigationRow.components,
		new ButtonBuilder()
			.setCustomId(buildEventReviewSubmitButtonId({ eventSessionId, mode: 'without' }))
			.setLabel('Submit Without Merits')
			.setStyle(ButtonStyle.Danger),
		new ButtonBuilder()
			.setCustomId(buildEventReviewSubmitButtonId({ eventSessionId, mode: 'with' }))
			.setLabel('Submit With Merits')
			.setStyle(ButtonStyle.Success)
	);
}
