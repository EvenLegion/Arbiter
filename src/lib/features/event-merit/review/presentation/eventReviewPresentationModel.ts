import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import type { EventReviewPageAttendee } from '../../../../../integrations/prisma/repositories';
import { stripLeadingPrefixSegments } from '../../../../services/bulk-nickname/nicknameTransform';
import { stripTrailingMeritRankSuffix } from '../../../../services/nickname/buildUserNickname';

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
	defaultMinAttendancePct = 100,
	fullAttendanceGraceSeconds = 0
}: {
	state: EventSessionState;
	durationSeconds: number;
	page: number;
	attendees: EventReviewPageAttendee[];
	pageSize: number;
	defaultMinAttendancePct?: number;
	fullAttendanceGraceSeconds?: number;
}) {
	const presentationAttendees = attendees.map((attendee, index) => {
		const attendancePercent = computeEventReviewAttendancePercent({
			attendedSeconds: attendee.attendedSeconds,
			durationSeconds,
			fullAttendanceGraceSeconds
		});
		const selectedDecision = resolveEventReviewDecision({
			decision: attendee.decision,
			attendedSeconds: attendee.attendedSeconds,
			durationSeconds,
			defaultMinAttendancePct,
			fullAttendanceGraceSeconds
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
								`${attendee.absoluteIndex}. <@${attendee.discordUserId}> - ${formatMinutes(attendee.attendedSeconds)} (${Math.round(attendee.attendancePercent)}%) - **${attendee.decisionLabel}**`
						)
						.join('\n'),
		attendees: presentationAttendees
	};
}

export function computeEventReviewAttendancePercent({
	attendedSeconds,
	durationSeconds,
	fullAttendanceGraceSeconds = 0
}: {
	attendedSeconds: number;
	durationSeconds: number;
	fullAttendanceGraceSeconds?: number;
}) {
	if (durationSeconds <= 0) {
		return 0;
	}

	const safeAttendedSeconds = Math.max(0, attendedSeconds);
	if (durationSeconds - safeAttendedSeconds <= Math.max(0, fullAttendanceGraceSeconds)) {
		return 100;
	}

	const ratio = Math.max(0, Math.min(1, safeAttendedSeconds / durationSeconds));
	return ratio * 100;
}

export function resolveEventReviewDecision({
	decision,
	attendedSeconds,
	durationSeconds,
	defaultMinAttendancePct,
	fullAttendanceGraceSeconds = 0
}: {
	decision: EventReviewPageAttendee['decision'];
	attendedSeconds: number;
	durationSeconds: number;
	defaultMinAttendancePct: number;
	fullAttendanceGraceSeconds?: number;
}) {
	if (decision) {
		return decision;
	}

	if (durationSeconds <= 0) {
		return EventReviewDecisionKind.NO_MERIT;
	}

	return computeEventReviewAttendancePercent({
		attendedSeconds,
		durationSeconds,
		fullAttendanceGraceSeconds
	}) >= defaultMinAttendancePct
		? EventReviewDecisionKind.MERIT
		: EventReviewDecisionKind.NO_MERIT;
}

function buildDecisionLabelSuffix({ discordNickname, discordUsername }: { discordNickname: string; discordUsername: string }) {
	const raw = (discordNickname || discordUsername).trim();
	if (raw.length === 0) {
		return 'Unknown';
	}

	const withoutPrefix = stripLeadingPrefixSegments(raw);
	const withoutSuffix = stripTrailingMeritRankSuffix(withoutPrefix).trim();
	const cleaned = withoutSuffix.length > 0 ? withoutSuffix : raw;

	return cleaned.slice(0, 24);
}

function formatMinutes(attendedSeconds: number) {
	return `${Math.floor(Math.max(0, attendedSeconds) / 60)} min`;
}

function formatDecisionLabel(decision: EventReviewDecisionKind) {
	return decision === EventReviewDecisionKind.MERIT ? 'Merit' : 'No Merit';
}
