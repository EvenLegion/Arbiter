import { AttachmentBuilder, EmbedBuilder, escapeMarkdown } from 'discord.js';

import type { BulkNicknamePlanEntry, SyncBulkNicknamesResult } from '../../../services/bulk-nickname/bulkNicknameService';
import { escapeCsvCell } from '../merit-badges/meritBadgeReportCsv';

export const NICKNAME_SYNC_DRY_RUN_CSV_NAME = 'nickname-sync-dry-run.csv';

const DRY_RUN_SAMPLE_SIZE = 10;

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
	const stopped = result.stopReason !== null;
	const summaryEmbed = new EmbedBuilder()
		.setTitle(buildTitle(result.dryRun, stopped))
		.setColor(unsuccessful > 0 || stopped ? 0xf59e0b : result.dryRun ? 0x3b82f6 : 0x22c55e)
		.addFields(
			{ name: 'Mode', value: result.scope === 'single' ? 'Single User' : 'All DB Users', inline: true },
			{ name: 'Include Staff', value: includeStaff ? 'Yes' : 'No', inline: true },
			{ name: 'Targets', value: String(result.targetCount), inline: true },
			{ name: 'Attempted', value: String(result.attempted), inline: true },
			{ name: result.dryRun ? 'Would Update' : 'Updated', value: String(result.updated), inline: true },
			{ name: 'Unchanged', value: String(result.unchanged), inline: true },
			{ name: 'Skipped Staff', value: String(result.skippedStaff), inline: true },
			{ name: 'Skipped By Rule', value: String(result.skippedByRule), inline: true },
			{ name: 'Missing In Guild', value: String(result.missingInGuild), inline: true },
			{ name: 'Failed', value: String(result.failed), inline: true }
		)
		.setTimestamp();
	if (stopped) {
		summaryEmbed.addFields({ name: 'Remaining', value: String(result.remaining), inline: true });
	}
	const stopNote = buildStopNote(result);

	if (!result.dryRun) {
		return {
			content:
				stopNote +
				(unsuccessful > 0
					? `Some nickname sync operations were unsuccessful. Share requestId=\`${requestId}\` with TECH.`
					: stopped
						? `requestId=\`${requestId}\``
						: `Nickname sync succeeded. requestId=\`${requestId}\``),
			embeds: [summaryEmbed]
		};
	}

	const changes = result.plan.filter((entry) => entry.action === 'change');
	if (changes.length > 0) {
		const sample = changes.slice(0, DRY_RUN_SAMPLE_SIZE).map(formatChangeLine);
		const more = changes.length > DRY_RUN_SAMPLE_SIZE ? `\n…and ${changes.length - DRY_RUN_SAMPLE_SIZE} more in the CSV.` : '';
		summaryEmbed.setDescription(`**Nicknames a live run would change**\n${sample.join('\n')}${more}`);
	}

	const failureNote = unsuccessful > 0 ? ' Some members could not be checked.' : '';
	return {
		content:
			stopNote +
			(result.plan.length > 0
				? `Dry run only: no nicknames were changed. The CSV lists every change, skipped staff member and failure.${failureNote} requestId=\`${requestId}\``
				: `Dry run only: no nicknames were changed.${failureNote} requestId=\`${requestId}\``),
		embeds: [summaryEmbed],
		files:
			result.plan.length > 0
				? [new AttachmentBuilder(Buffer.from(buildNicknameSyncDryRunCsv(result.plan), 'utf8'), { name: NICKNAME_SYNC_DRY_RUN_CSV_NAME })]
				: []
	};
}

/**
 * The dry-run CSV: one row per nickname a live run would change (including nicknames someone edited by
 * hand, which a live run overwrites), per staff member it would skip, and per member it would fail on.
 */
export function buildNicknameSyncDryRunCsv(plan: readonly BulkNicknamePlanEntry[]): string {
	const header = ['discord_user_id', 'stored_username', 'action', 'current_nickname', 'planned_nickname', 'reason'];
	const lines = [header.map(escapeCsvCell).join(',')];
	for (const entry of plan) {
		lines.push(
			[entry.discordUserId, entry.discordUsername, entry.action, entry.currentNickname, entry.plannedNickname, entry.reason]
				.map(escapeCsvCell)
				.join(',')
		);
	}

	return `${lines.join('\r\n')}\r\n`;
}

function formatChangeLine(entry: BulkNicknamePlanEntry) {
	const current = entry.currentNickname === null ? '(no nickname)' : escapeMarkdown(entry.currentNickname);
	return `${current} → ${escapeMarkdown(entry.plannedNickname ?? '')}`;
}

function buildTitle(dryRun: boolean, stopped: boolean) {
	if (dryRun) {
		return stopped ? 'Nickname Sync Dry Run (Stopped Early)' : 'Nickname Sync Dry Run';
	}

	return stopped ? 'Nickname Sync Stopped Early' : 'Nickname Sync Complete';
}

function buildStopNote(result: Extract<SyncBulkNicknamesResult, { kind: 'completed' }>) {
	if (result.stopReason === null) {
		return '';
	}

	const why =
		result.stopReason === 'rate_limited' ? 'Stopped early after repeated long Discord rate-limit waits.' : 'Stopped early at the time limit.';
	return `${why} ${result.remaining} users were not checked. Run the command again to continue; users who are already correct are skipped.\n`;
}
