import { EmbedBuilder } from 'discord.js';

import type { SyncBulkNicknamesResult } from '../../services/bulk-nickname/bulkNicknameService';

export function buildBulkNicknameSyncPayload({
	result,
	includeStaff,
	requestId
}: {
	result: Extract<SyncBulkNicknamesResult, { kind: 'completed' }>;
	includeStaff: boolean;
	requestId: string;
}) {
	const unsuccessful = result.failed + result.missingInGuild;
	const summaryEmbed = new EmbedBuilder()
		.setTitle('Nickname Sync Complete')
		.setColor(unsuccessful > 0 ? 0xf59e0b : 0x22c55e)
		.addFields(
			{ name: 'Mode', value: result.scope === 'single' ? 'Single User' : 'All DB Users', inline: true },
			{ name: 'Include Staff', value: includeStaff ? 'Yes' : 'No', inline: true },
			{ name: 'Targets', value: String(result.targetCount), inline: true },
			{ name: 'Attempted', value: String(result.attempted), inline: true },
			{ name: 'Updated', value: String(result.updated), inline: true },
			{ name: 'Unchanged', value: String(result.unchanged), inline: true },
			{ name: 'Skipped Staff', value: String(result.skippedStaff), inline: true },
			{ name: 'Skipped By Rule', value: String(result.skippedByRule), inline: true },
			{ name: 'Missing In Guild', value: String(result.missingInGuild), inline: true },
			{ name: 'Failed', value: String(result.failed), inline: true }
		)
		.setTimestamp();

	return {
		content:
			unsuccessful > 0
				? `Some nickname sync operations were unsuccessful. Share requestId=\`${requestId}\` with TECH.`
				: `Nickname sync succeeded. requestId=\`${requestId}\``,
		embeds: [summaryEmbed]
	};
}
