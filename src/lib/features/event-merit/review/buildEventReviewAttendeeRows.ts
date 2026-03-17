import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { EventReviewDecisionKind } from '@prisma/client';

import type { EventReviewPresentationAttendee } from './eventReviewPresentationModel';
import { buildEventReviewAttendeeLabelButtonId, buildEventReviewDecisionButtonId } from './parseEventReviewButton';

export function buildEventReviewAttendeeRows({
	eventSessionId,
	page,
	attendees
}: {
	eventSessionId: number;
	page: number;
	attendees: EventReviewPresentationAttendee[];
}) {
	return attendees.map((attendee) =>
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(buildEventReviewAttendeeLabelButtonId({ eventSessionId, targetDbUserId: attendee.dbUserId, page }))
				.setLabel(attendee.labelSuffix)
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(true),
			new ButtonBuilder()
				.setCustomId(buildEventReviewDecisionButtonId({ eventSessionId, targetDbUserId: attendee.dbUserId, decisionCode: 'n', page }))
				.setLabel('No Merit')
				.setStyle(attendee.selectedDecision === EventReviewDecisionKind.NO_MERIT ? ButtonStyle.Danger : ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId(buildEventReviewDecisionButtonId({ eventSessionId, targetDbUserId: attendee.dbUserId, decisionCode: 'm', page }))
				.setLabel('Merit')
				.setStyle(attendee.selectedDecision === EventReviewDecisionKind.MERIT ? ButtonStyle.Success : ButtonStyle.Secondary)
		)
	);
}
