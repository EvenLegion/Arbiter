import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { ENV_DISCORD } from '../../../../config/env/discord';
import {
	buildEventReviewAttendeeLabelButtonId,
	buildEventReviewDecisionButtonId,
	buildEventReviewPageButtonId,
	buildEventReviewPageIndicatorButtonId,
	buildEventReviewSubmitButtonId
} from './parseEventReviewButton';
import { buildEventReviewPresentationModel } from './eventReviewPresentationModel';
import { formatEventSessionStateLabel } from '../ui/formatEventSessionStateLabel';
import type { EventReviewPageAttendee } from '../../../../integrations/prisma/repositories';

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
				value: presentationModel.attendeesFieldValue,
				inline: false
			}
		)
		.setFooter({
			text: `Event session ID: ${eventSessionId}`
		});

	const navigationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
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

	if (!presentationModel.reviewIsOpen) {
		return {
			embeds: [embed],
			components: [navigationRow]
		};
	}

	const submitAndNavigationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
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
			.setDisabled(page >= totalPages),
		new ButtonBuilder()
			.setCustomId(buildEventReviewSubmitButtonId({ eventSessionId, mode: 'without' }))
			.setLabel('Submit Without Merits')
			.setStyle(ButtonStyle.Danger)
			.setDisabled(false),
		new ButtonBuilder()
			.setCustomId(buildEventReviewSubmitButtonId({ eventSessionId, mode: 'with' }))
			.setLabel('Submit With Merits')
			.setStyle(ButtonStyle.Success)
			.setDisabled(false)
	);

	const attendeeRows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (const attendeeChunk of chunk(presentationModel.attendees, 1)) {
		const row = new ActionRowBuilder<ButtonBuilder>();
		for (const attendee of attendeeChunk) {
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(buildEventReviewAttendeeLabelButtonId({ eventSessionId, targetDbUserId: attendee.dbUserId, page }))
					.setLabel(attendee.labelSuffix)
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(true),
				new ButtonBuilder()
					.setCustomId(buildEventReviewDecisionButtonId({ eventSessionId, targetDbUserId: attendee.dbUserId, decisionCode: 'n', page }))
					.setLabel('No Merit')
					.setStyle(attendee.selectedDecision === EventReviewDecisionKind.NO_MERIT ? ButtonStyle.Danger : ButtonStyle.Secondary)
					.setDisabled(false),
				new ButtonBuilder()
					.setCustomId(buildEventReviewDecisionButtonId({ eventSessionId, targetDbUserId: attendee.dbUserId, decisionCode: 'm', page }))
					.setLabel('Merit')
					.setStyle(attendee.selectedDecision === EventReviewDecisionKind.MERIT ? ButtonStyle.Success : ButtonStyle.Secondary)
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

function formatDuration(durationSeconds: number) {
	const safeSeconds = Math.max(0, durationSeconds);
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}

	return `${minutes}m`;
}

function chunk<T>(values: T[], size: number) {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}

	return chunks;
}
