import { EmbedBuilder } from 'discord.js';
import { EventSessionState } from '@prisma/client';

import { formatEventSessionStateLabel } from '../../presentation/shared/formatEventSessionStateLabel';

export function buildEventReviewHeaderEmbed({
	eventSessionId,
	state,
	durationSeconds,
	attendeeCount,
	page,
	totalPages,
	attendeesFieldValue
}: {
	eventSessionId: number;
	state: EventSessionState;
	durationSeconds: number;
	attendeeCount: number;
	page: number;
	totalPages: number;
	attendeesFieldValue: string;
}) {
	return new EmbedBuilder()
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
