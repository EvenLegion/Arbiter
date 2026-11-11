import { AttachmentBuilder, EmbedBuilder } from 'discord.js';

import type { MeritBadgeRoleMap } from '../../../../config/meritBadgeRoles';
import type { MeritBadgeRoleCheckResult } from '../../../services/merit-badge/runMeritBadgeRoleCheck';
import type { MeritBadgeRoleIssue } from '../../../services/merit-badge/meritBadgeRoleCheck';
import {
	MERIT_BADGE_PLANNED_ACTIONS,
	type MeritBadgeBulkSyncResult,
	type MeritBadgeCutoverReport,
	type MeritBadgeLiveRunReadiness
} from '../../../services/merit-badge/meritBadgeBulkSyncService';
import { MAX_MERIT_BADGE_TIER } from '../../../services/merit-rank/meritBadge';
import { buildMeritBadgeReportCsv } from './meritBadgeReportCsv';

export const MERIT_BADGE_DRY_RUN_CSV_NAME = 'merit-badge-dry-run.csv';

const EMBED_FIELD_LIMIT = 1024;
const EMBED_DESCRIPTION_LIMIT = 4096;

export function buildMeritBadgeDryRunPayload({
	report,
	roleCheck,
	roleMap,
	requestId
}: {
	report: Extract<MeritBadgeCutoverReport, { kind: 'report' }>;
	roleCheck: MeritBadgeRoleCheckResult;
	roleMap: MeritBadgeRoleMap;
	requestId: string;
}) {
	const histogramLines = [
		...report.histogram.map(({ tier, count }) => `${tier.label} (tier ${tier.tier}): ${count}`),
		`No badge: ${report.noBadgeCount}`
	];

	const embed = new EmbedBuilder()
		.setTitle('Merit Badge Dry Run')
		.setColor(0x3b82f6)
		.setDescription(`**Members by earned badge**\n${joinLinesWithin(histogramLines, EMBED_DESCRIPTION_LIMIT - 40)}`)
		.addFields(
			{ name: 'Members', value: String(report.rows.length), inline: true },
			{ name: 'Badge roles configured', value: `${roleMap.configuredRoles.length} of ${MAX_MERIT_BADGE_TIER}`, inline: true },
			{
				name: 'Planned actions',
				value: MERIT_BADGE_PLANNED_ACTIONS.map((action) => `${action}: ${report.actionCounts[action]}`).join('\n'),
				inline: true
			},
			{ name: 'Role hierarchy check', value: formatRoleCheck(roleCheck) }
		)
		.setTimestamp();

	return {
		content: `Dry run only: nothing was changed. The CSV lists every member's plan. requestId=\`${requestId}\``,
		embeds: [embed],
		files: [new AttachmentBuilder(Buffer.from(buildMeritBadgeReportCsv(report.rows), 'utf8'), { name: MERIT_BADGE_DRY_RUN_CSV_NAME })]
	};
}

export function buildMeritBadgeLiveRunPayload({
	result,
	requestId
}: {
	result: Exclude<MeritBadgeBulkSyncResult, { kind: 'no_members' }>;
	requestId: string;
}) {
	const isPartial = result.kind === 'partial';
	const embed = new EmbedBuilder()
		.setTitle(isPartial ? 'Merit Badge Sync Stopped Early' : 'Merit Badge Sync Complete')
		.setColor(isPartial || result.failed > 0 ? 0xf59e0b : 0x22c55e)
		.addFields(
			{ name: 'Members', value: String(result.targetCount), inline: true },
			{ name: 'Processed', value: String(result.processed), inline: true },
			{ name: 'Remaining', value: String(result.remaining), inline: true },
			{ name: 'Updated', value: String(result.updated), inline: true },
			{ name: 'Unchanged', value: String(result.unchanged), inline: true },
			{ name: 'Left server', value: String(result.memberLeft), inline: true },
			{ name: 'Failed', value: String(result.failed), inline: true },
			{ name: 'Totals read failed', value: String(result.readFailed), inline: true },
			{ name: 'Rate-limit waits', value: `${result.rateLimitWaits} (${result.longRateLimitWaits} long)`, inline: true }
		)
		.setTimestamp();

	const lines: string[] = [];
	if (isPartial) {
		lines.push(
			result.stopReason === 'rate_limited' ? 'Stopped early after repeated long Discord rate-limit waits.' : 'Stopped early at the time limit.',
			'Run the command again to continue. Members who already have the right badge are skipped without Discord calls.'
		);
	} else {
		lines.push('Merit badge sync finished.');
	}
	if (result.failed > 0) {
		lines.push(`Some members failed. Run again, or share requestId=\`${requestId}\` with TECH.`);
	} else {
		lines.push(`requestId=\`${requestId}\``);
	}

	return {
		content: lines.join('\n'),
		embeds: [embed]
	};
}

export function buildMeritBadgeNotReadyMessage(readiness: Exclude<MeritBadgeLiveRunReadiness, { ok: true }>) {
	switch (readiness.reason) {
		case 'not_configured':
			return 'No merit badge role IDs are configured, so a live run cannot start. Nothing was changed. Use the dry run to preview.';
		case 'missing_manage_roles':
			return 'Arbiter does not have the Manage Roles permission. Nothing was changed.';
		case 'roles_not_editable': {
			const shown = readiness.tierLabels.slice(0, 10).join(', ');
			const more = readiness.tierLabels.length > 10 ? ` and ${readiness.tierLabels.length - 10} more` : '';
			return `Arbiter cannot assign these badge roles (missing, managed, or not below Arbiter's highest role): ${shown}${more}. Nothing was changed.`;
		}
	}
}

function formatRoleCheck(roleCheck: MeritBadgeRoleCheckResult) {
	switch (roleCheck.status) {
		case 'disabled':
			return 'Not run: no badge role IDs are configured.';
		case 'failed':
			return 'Could not read the server roles. See the logs for this requestId.';
		case 'checked':
			if (roleCheck.issues.length === 0) {
				return `No problems in ${roleCheck.configuredTierCount} configured badge roles.`;
			}
			return joinLinesWithin([`${roleCheck.issues.length} problem(s):`, ...roleCheck.issues.map(formatRoleIssue)], EMBED_FIELD_LIMIT);
	}
}

export function formatRoleIssue(issue: MeritBadgeRoleIssue) {
	switch (issue.kind) {
		case 'role_missing':
			return `${issue.tierLabel}: role ID not found in this server`;
		case 'not_below_bot_role':
			return `${issue.tierLabel}: not below Arbiter's highest role (${issue.otherRoleName})`;
		case 'not_below_staff_role':
			return `${issue.tierLabel}: not below the lowest staff role (${issue.otherRoleName})`;
		case 'not_below_moderation_role':
			return `${issue.tierLabel}: not below the lowest moderation role (${issue.otherRoleName})`;
		case 'has_moderation_permissions':
			return `${issue.tierLabel}: has moderation permissions`;
	}
}

/** Joins lines; when they would pass `limit`, keeps the lines that fit and ends with "…and N more". */
export function joinLinesWithin(lines: readonly string[], limit: number) {
	const full = lines.join('\n');
	if (full.length <= limit) {
		return full;
	}

	const kept: string[] = [];
	for (const line of lines) {
		const moreLine = `…and ${lines.length - kept.length - 1} more`;
		if ([...kept, line, moreLine].join('\n').length > limit) {
			break;
		}
		kept.push(line);
	}
	return [...kept, `…and ${lines.length - kept.length} more`].join('\n');
}
