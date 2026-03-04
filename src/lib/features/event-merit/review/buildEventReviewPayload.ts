import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { EventReviewPageAttendee } from '../../../../integrations/prisma/event/getEventReviewPage';
import { EVENT_REVIEW_MERIT_THRESHOLD } from './constants';
import { formatEventSessionStateLabel } from '../ui/formatEventSessionStateLabel';

type BuildEventReviewPayloadParams = {
	eventSessionId: number;
	eventName: string;
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
	const attendeesFieldValue =
		attendees.length === 0
			? 'No tracked attendees were found for this event.'
			: attendees
					.map((attendee, index) => {
						const absoluteIndex = (page - 1) * pageSize + index + 1;
						const attendancePercent = computeAttendancePercent({
							attendedSeconds: attendee.attendedSeconds,
							durationSeconds
						});
						const decision = resolveDecision({
							decision: attendee.decision,
							attendedSeconds: attendee.attendedSeconds,
							durationSeconds
						});

						return `${absoluteIndex}. <@${attendee.discordUserId}> - ${formatMinutes(attendee.attendedSeconds)} (${attendancePercent.toFixed(1)}%) - **${formatDecisionLabel(decision)}**`;
					})
					.join('\n');

	const embed = new EmbedBuilder()
		.setTitle('Event Merit Review')
		.setColor(0xf59e0b)
		.addFields(
			{
				name: 'Duration',
				value: formatDuration(durationSeconds),
				inline: true
			},
			{
				name: 'Number of Attendees',
				value: String(attendeeCount),
				inline: true
			},
			{
				name: 'Page',
				value: `${page}/${totalPages}`,
				inline: true
			},
			{
				name: 'State',
				value: formatEventSessionStateLabel(state),
				inline: true
			},
			{
				name: 'Attendees',
				value: attendeesFieldValue,
				inline: false
			}
		)
		.setFooter({
			text: `Event session ID: ${eventSessionId}`
		});

	const reviewIsOpen = state === EventSessionState.ENDED_PENDING_REVIEW;

	const navigationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(buildPageButtonId({ eventSessionId, page: Math.max(1, page - 1), source: 'prev' }))
			.setLabel('Prev')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page <= 1),
		new ButtonBuilder()
			.setCustomId(`event:review:page-indicator:${eventSessionId}:${page}`)
			.setLabel(`Page ${page}/${totalPages}`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
		new ButtonBuilder()
			.setCustomId(buildPageButtonId({ eventSessionId, page: Math.min(totalPages, page + 1), source: 'next' }))
			.setLabel('Next')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page >= totalPages)
	);

	if (!reviewIsOpen) {
		return {
			embeds: [embed],
			components: [navigationRow]
		};
	}

	const submitAndNavigationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(buildPageButtonId({ eventSessionId, page: Math.max(1, page - 1), source: 'prev' }))
			.setLabel('Prev')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page <= 1),
		new ButtonBuilder()
			.setCustomId(`event:review:page-indicator:${eventSessionId}:${page}`)
			.setLabel(`Page ${page}/${totalPages}`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
		new ButtonBuilder()
			.setCustomId(buildPageButtonId({ eventSessionId, page: Math.min(totalPages, page + 1), source: 'next' }))
			.setLabel('Next')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page >= totalPages),
		new ButtonBuilder()
			.setCustomId(buildSubmitButtonId({ eventSessionId, mode: 'without' }))
			.setLabel('Submit Without Merits')
			.setStyle(ButtonStyle.Danger)
			.setDisabled(false),
		new ButtonBuilder()
			.setCustomId(buildSubmitButtonId({ eventSessionId, mode: 'with' }))
			.setLabel('Submit With Merits')
			.setStyle(ButtonStyle.Success)
			.setDisabled(false)
	);

	const attendeeRows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (const attendeeChunk of chunk(attendees, 1)) {
		const row = new ActionRowBuilder<ButtonBuilder>();
		for (const attendee of attendeeChunk) {
			const selectedDecision = resolveDecision({
				decision: attendee.decision,
				attendedSeconds: attendee.attendedSeconds,
				durationSeconds
			});
			const labelSuffix = buildDecisionLabelSuffix({
				discordNickname: attendee.discordNickname,
				discordUsername: attendee.discordUsername
			});

			row.addComponents(
				new ButtonBuilder()
					.setCustomId(buildAttendeeLabelButtonId({ eventSessionId, targetDbUserId: attendee.dbUserId, page }))
					.setLabel(labelSuffix)
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(true),
				new ButtonBuilder()
					.setCustomId(buildDecisionButtonId({ eventSessionId, targetDbUserId: attendee.dbUserId, decisionCode: 'n', page }))
					.setLabel('No Merit')
					.setStyle(selectedDecision === EventReviewDecisionKind.NO_MERIT ? ButtonStyle.Danger : ButtonStyle.Secondary)
					.setDisabled(false),
				new ButtonBuilder()
					.setCustomId(buildDecisionButtonId({ eventSessionId, targetDbUserId: attendee.dbUserId, decisionCode: 'm', page }))
					.setLabel('Merit')
					.setStyle(selectedDecision === EventReviewDecisionKind.MERIT ? ButtonStyle.Success : ButtonStyle.Secondary)
					.setDisabled(false)
			);
		}

		attendeeRows.push(row);
	}

	return {
		embeds: [embed],
		components: [submitAndNavigationRow, ...attendeeRows]
	};
}

function buildSubmitButtonId({ eventSessionId, mode }: { eventSessionId: number; mode: 'with' | 'without' }) {
	return `event:review:submit:${mode}:${eventSessionId}`;
}

function buildDecisionLabelSuffix({ discordNickname, discordUsername }: { discordNickname: string; discordUsername: string }) {
	const raw = (discordNickname || discordUsername).trim();
	if (raw.length === 0) {
		return 'Unknown';
	}

	return raw.slice(0, 24);
}

function buildDecisionButtonId({
	eventSessionId,
	targetDbUserId,
	decisionCode,
	page
}: {
	eventSessionId: number;
	targetDbUserId: string;
	decisionCode: 'm' | 'n';
	page: number;
}) {
	return `event:review:decision:${eventSessionId}:${targetDbUserId}:${decisionCode}:${page}`;
}

function buildAttendeeLabelButtonId({ eventSessionId, targetDbUserId, page }: { eventSessionId: number; targetDbUserId: string; page: number }) {
	return `event:review:attendee:${eventSessionId}:${targetDbUserId}:${page}`;
}

function buildPageButtonId({ eventSessionId, page, source }: { eventSessionId: number; page: number; source: 'prev' | 'next' }) {
	return `event:review:page:${eventSessionId}:${page}:${source}`;
}

function formatMinutes(attendedSeconds: number) {
	return `${Math.floor(Math.max(0, attendedSeconds) / 60)} min`;
}

function formatDuration(durationSeconds: number) {
	const safeSeconds = Math.max(0, durationSeconds);
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}

	return `${minutes}m`;
}

function computeAttendancePercent({ attendedSeconds, durationSeconds }: { attendedSeconds: number; durationSeconds: number }) {
	if (durationSeconds <= 0) {
		return 0;
	}

	const ratio = Math.max(0, Math.min(1, attendedSeconds / durationSeconds));
	return ratio * 100;
}

function resolveDecision({
	decision,
	attendedSeconds,
	durationSeconds
}: {
	decision: EventReviewPageAttendee['decision'];
	attendedSeconds: number;
	durationSeconds: number;
}) {
	if (decision) {
		return decision;
	}

	if (durationSeconds <= 0) {
		return EventReviewDecisionKind.NO_MERIT;
	}

	return attendedSeconds / durationSeconds >= EVENT_REVIEW_MERIT_THRESHOLD ? EventReviewDecisionKind.MERIT : EventReviewDecisionKind.NO_MERIT;
}

function formatDecisionLabel(decision: EventReviewDecisionKind) {
	return decision === EventReviewDecisionKind.MERIT ? 'Merit' : 'No Merit';
}

function chunk<T>(values: T[], size: number) {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}

	return chunks;
}
