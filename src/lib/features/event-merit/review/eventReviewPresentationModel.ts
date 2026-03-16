import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import type { EventReviewPageAttendee } from '../../../../integrations/prisma/repositories';

export type EventReviewPresentationAttendee = {
	dbUserId: string;
	discordUserId: string;
	labelSuffix: string;
	attendedSeconds: number;
	attendancePercent: number;
	selectedDecision: EventReviewDecisionKind;
	decisionLabel: string;
};

export function buildEventReviewPresentationModel({
	state,
	durationSeconds,
	page,
	attendees,
	pageSize,
	defaultMinAttendancePct = 100
}: {
	state: EventSessionState;
	durationSeconds: number;
	page: number;
	attendees: EventReviewPageAttendee[];
	pageSize: number;
	defaultMinAttendancePct?: number;
}) {
	const presentationAttendees = attendees.map((attendee, index) => {
		const attendancePercent = computeEventReviewAttendancePercent({
			attendedSeconds: attendee.attendedSeconds,
			durationSeconds
		});
		const selectedDecision = resolveEventReviewDecision({
			decision: attendee.decision,
			attendedSeconds: attendee.attendedSeconds,
			durationSeconds,
			defaultMinAttendancePct
		});

		return {
			dbUserId: attendee.dbUserId,
			discordUserId: attendee.discordUserId,
			labelSuffix: buildDecisionLabelSuffix({
				discordNickname: attendee.discordNickname,
				discordUsername: attendee.discordUsername
			}),
			attendedSeconds: attendee.attendedSeconds,
			attendancePercent,
			selectedDecision,
			decisionLabel: formatDecisionLabel(selectedDecision),
			absoluteIndex: (page - 1) * pageSize + index + 1
		};
	});

	return {
		reviewIsOpen: state === EventSessionState.ENDED_PENDING_REVIEW,
		attendeesFieldValue:
			presentationAttendees.length === 0
				? 'No tracked attendees were found for this event.'
				: presentationAttendees
						.map(
							(attendee) =>
								`${attendee.absoluteIndex}. <@${attendee.discordUserId}> - ${formatMinutes(attendee.attendedSeconds)} (${attendee.attendancePercent.toFixed(1)}%) - **${attendee.decisionLabel}**`
						)
						.join('\n'),
		attendees: presentationAttendees
	};
}

export function computeEventReviewAttendancePercent({ attendedSeconds, durationSeconds }: { attendedSeconds: number; durationSeconds: number }) {
	if (durationSeconds <= 0) {
		return 0;
	}

	const ratio = Math.max(0, Math.min(1, attendedSeconds / durationSeconds));
	return ratio * 100;
}

export function resolveEventReviewDecision({
	decision,
	attendedSeconds,
	durationSeconds,
	defaultMinAttendancePct
}: {
	decision: EventReviewPageAttendee['decision'];
	attendedSeconds: number;
	durationSeconds: number;
	defaultMinAttendancePct: number;
}) {
	if (decision) {
		return decision;
	}

	if (durationSeconds <= 0) {
		return EventReviewDecisionKind.NO_MERIT;
	}

	return attendedSeconds / durationSeconds >= defaultMinAttendancePct / 100 ? EventReviewDecisionKind.MERIT : EventReviewDecisionKind.NO_MERIT;
}

function buildDecisionLabelSuffix({ discordNickname, discordUsername }: { discordNickname: string; discordUsername: string }) {
	const raw = (discordNickname || discordUsername).trim();
	if (raw.length === 0) {
		return 'Unknown';
	}

	return raw.slice(0, 24);
}

function formatMinutes(attendedSeconds: number) {
	return `${Math.floor(Math.max(0, attendedSeconds) / 60)} min`;
}

function formatDecisionLabel(decision: EventReviewDecisionKind) {
	return decision === EventReviewDecisionKind.MERIT ? 'Merit' : 'No Merit';
}
