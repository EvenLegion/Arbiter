import { EmbedBuilder } from 'discord.js';

import type { TransformBulkNicknamesResult } from '../../services/bulk-nickname/bulkNicknameService';

export function buildBulkNicknameTransformPayload({
	result,
	requestId
}: {
	result: Extract<TransformBulkNicknamesResult, { kind: 'completed' }>;
	requestId: string;
}) {
	const unsuccessful = result.failed + result.missingInGuild;
	const summaryEmbed = new EmbedBuilder()
		.setTitle('Dev Nickname Command Complete')
		.setColor(unsuccessful > 0 ? 0xf59e0b : 0x22c55e)
		.addFields(
			{ name: 'Mode', value: result.mode, inline: true },
			{ name: 'Target Scope', value: result.scope === 'single' ? 'Single User' : 'All DB Users', inline: true },
			{ name: 'Targets', value: String(result.targetCount), inline: true },
			{ name: 'Updated', value: String(result.updated), inline: true },
			{ name: 'Unchanged', value: String(result.unchanged), inline: true },
			{ name: 'Missing In Guild', value: String(result.missingInGuild), inline: true },
			{ name: 'Failed', value: String(result.failed), inline: true }
		)
		.setTimestamp();

	if (result.failures.length > 0) {
		summaryEmbed.addFields({
			name: 'Failure Preview',
			value: result.failures
				.slice(0, 10)
				.map((failure) => `- ${failure.discordUsername} (${failure.discordUserId}) dbUserId=${failure.dbUserId} :: ${failure.reason}`)
				.join('\n')
				.slice(0, 1024)
		});
	}

	return {
		content:
			unsuccessful > 0
				? `Dev nickname command finished with issues. requestId=\`${requestId}\``
				: `Dev nickname command finished successfully. requestId=\`${requestId}\``,
		embeds: [summaryEmbed]
	};
}
