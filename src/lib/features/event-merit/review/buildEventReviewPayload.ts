import { EventSessionState } from '@prisma/client';
import { ENV_DISCORD } from '../../../../config/env/discord';
import { buildEventReviewPresentationModel } from './eventReviewPresentationModel';
import type { EventReviewPageAttendee } from '../../../../integrations/prisma/repositories';
import { buildEventReviewAttendeeRows } from './buildEventReviewAttendeeRows';
import { buildEventReviewHeaderEmbed } from './buildEventReviewHeaderEmbed';
import { buildEventReviewNavigationRow } from './buildEventReviewNavigationRow';
import { buildEventReviewSubmitControlsRow } from './buildEventReviewSubmitControlsRow';

type BuildEventReviewPayloadParams = {
	eventSessionId: number;
	state: EventSessionState;
	durationSeconds: number;
	attendeeCount: number;
	page: number;
	totalPages: number;
	attendees: EventReviewPageAttendee[];
	pageSize: number;
};

export function buildEventReviewPayload({
	eventSessionId,
	state,
	durationSeconds,
	attendeeCount,
	page,
	totalPages,
	attendees,
	pageSize
}: BuildEventReviewPayloadParams) {
	const presentationModel = buildEventReviewPresentationModel({
		state,
		durationSeconds,
		page,
		attendees,
		pageSize,
		defaultMinAttendancePct: ENV_DISCORD.EVENT_MERIT_DEFAULT_MIN_ATTENDANCE_PCT
	});

	const embed = buildEventReviewHeaderEmbed({
		eventSessionId,
		state,
		durationSeconds,
		attendeeCount,
		page,
		totalPages,
		attendeesFieldValue: presentationModel.attendeesFieldValue
	});
	const navigationRow = buildEventReviewNavigationRow({
		eventSessionId,
		page,
		totalPages
	});

	if (!presentationModel.reviewIsOpen) {
		return {
			embeds: [embed],
			components: [navigationRow]
		};
	}

	return {
		embeds: [embed],
		components: [
			buildEventReviewSubmitControlsRow({
				eventSessionId,
				page,
				totalPages
			}),
			...buildEventReviewAttendeeRows({
				eventSessionId,
				page,
				attendees: presentationModel.attendees
			})
		]
	};
}
