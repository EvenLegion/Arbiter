import { EmbedBuilder } from 'discord.js';
import { EventSessionState } from '@prisma/client';

import { formatEventSessionStateLabel } from '../../presentation/shared/formatEventSessionStateLabel';

export function buildEventReviewHeaderEmbed({
	eventSessionId,
	state,
	durationSeconds,
	expectedEventDuration,
	attendeeCount,
	page,
	totalPages,
	attendeesFieldValue
}: {
	eventSessionId: number;
	state: EventSessionState;
	durationSeconds: number;
	expectedEventDuration?: number | null;
	attendeeCount: number;
	page: number;
	totalPages: number;
	attendeesFieldValue: string;
}) {
	return new EmbedBuilder()
		.setTitle('Event Merit Review')
		.setColor(0xf59e0b)
		.setDescription(expectedEventDuration == null ? null : `Expected duration: ${formatDuration(expectedEventDuration * 60)}.`)
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
			...buildAttendeeFields(attendeesFieldValue)
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

function buildAttendeeFields(attendeesFieldValue: string) {
	const chunks: string[] = [];
	for (const line of attendeesFieldValue.split('\n')) {
		const previous = chunks[chunks.length - 1];
		if (previous !== undefined && previous.length + line.length + 1 <= 1024) {
			chunks[chunks.length - 1] = `${previous}\n${line}`;
		} else {
			chunks.push(line);
		}
	}
	return chunks.map((value, index) => ({ name: index === 0 ? 'Attendees' : 'Attendees (continued)', value, inline: false }));
}
