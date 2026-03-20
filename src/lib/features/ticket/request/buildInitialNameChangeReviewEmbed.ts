import { EmbedBuilder } from 'discord.js';

export function buildInitialNameChangeReviewEmbed({
	requestId,
	requesterDiscordUserId,
	currentName,
	requestedName,
	reason
}: {
	requestId: number;
	requesterDiscordUserId: string;
	currentName: string;
	requestedName: string;
	reason: string;
}) {
	return new EmbedBuilder()
		.setTitle('Name Change Request')
		.setColor(0xf59e0b)
		.addFields(
			{
				name: 'Requester',
				value: `<@${requesterDiscordUserId}>`,
				inline: false
			},
			{
				name: 'Current Name',
				value: trimForEmbed(currentName, 100),
				inline: false
			},
			{
				name: 'Requested Name',
				value: trimForEmbed(requestedName, 100),
				inline: false
			},
			{
				name: 'Reason',
				value: trimForEmbed(reason, 1_000),
				inline: false
			},
			{
				name: 'Status',
				value: 'Pending',
				inline: true
			}
		)
		.setFooter({
			text: `Request ID: ${requestId}`
		})
		.setTimestamp(new Date());
}

function trimForEmbed(value: string, maxLength: number) {
	const trimmed = value.trim();
	if (trimmed.length <= maxLength) {
		return trimmed;
	}

	return `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
}
