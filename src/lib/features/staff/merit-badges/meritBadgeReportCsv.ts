import type { MeritBadgeReportRow } from '../../../services/merit-badge/meritBadgeBulkSyncService';

const CSV_HEADER = [
	'discord_user_id',
	'stored_username',
	'total_merits',
	'legacy_level',
	'legacy_symbol',
	'desired_tier',
	'desired_badge',
	'desired_role_configured',
	'current_badges',
	'planned_action'
] as const;

/**
 * The dry-run CSV: Discord IDs, stored usernames, totals and badge plans only. No nicknames,
 * display names or other profile data.
 */
export function buildMeritBadgeReportCsv(rows: readonly MeritBadgeReportRow[]): string {
	const lines = [CSV_HEADER.map(escapeCsvCell).join(',')];
	for (const row of rows) {
		lines.push(
			[
				row.discordUserId,
				row.storedUsername,
				row.totalMerits,
				row.legacyLevel,
				row.legacySymbol,
				row.desiredTier?.tier ?? null,
				row.desiredTier?.label ?? null,
				row.desiredTier ? (row.desiredRoleConfigured ? 'yes' : 'no') : null,
				row.currentTiers.map((tier) => tier.label).join('; '),
				row.action
			]
				.map(escapeCsvCell)
				.join(',')
		);
	}

	return `${lines.join('\r\n')}\r\n`;
}

/**
 * Escapes one CSV cell. A text cell that starts with `=`, `+`, `-`, `@`, tab or carriage return gets a
 * leading `'` so a spreadsheet shows it as text instead of running it as a formula. Cells with a
 * comma, quote or line break are quoted (RFC 4180). Numbers are written as numbers.
 */
export function escapeCsvCell(value: string | number | null): string {
	if (value === null) {
		return '';
	}

	let text = String(value);
	if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) {
		text = `'${text}`;
	}
	if (/[",\r\n]/.test(text)) {
		text = `"${text.replace(/"/g, '""')}"`;
	}

	return text;
}
