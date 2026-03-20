import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { EventReviewDecisionKind } from '@prisma/client';

import type { EventReviewPresentationAttendee } from './eventReviewPresentationModel';
import { buildEventReviewDecisionButtonId } from '../buttons/eventReviewButtonProtocol';

export function buildEventReviewAttendeeRows({
	eventSessionId,
	page,
	attendees
}: {
	eventSessionId: number;
	page: number;
	attendees: EventReviewPresentationAttendee[];
}) {
	return chunkAttendees(attendees, 5).map((attendeeChunk) =>
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			...attendeeChunk.map((attendee) =>
				new ButtonBuilder()
					.setCustomId(
						buildEventReviewDecisionButtonId({
							eventSessionId,
							targetDbUserId: attendee.dbUserId,
							page
						})
					)
					.setLabel(attendee.labelSuffix)
					.setStyle(attendee.selectedDecision === EventReviewDecisionKind.MERIT ? ButtonStyle.Success : ButtonStyle.Danger)
			)
		)
	);
}

function chunkAttendees(attendees: EventReviewPresentationAttendee[], chunkSize: number) {
	const chunks: EventReviewPresentationAttendee[][] = [];

	for (let index = 0; index < attendees.length; index += chunkSize) {
		chunks.push(attendees.slice(index, index + chunkSize));
	}

	return chunks;
}
