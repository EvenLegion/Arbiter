import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { createMeritBadgeRoleMap } from '../../../../../../src/config/meritBadgeRoles';
import {
	buildMeritBadgeDryRunPayload,
	buildMeritBadgeLiveRunPayload,
	buildMeritBadgeNotReadyMessage,
	joinLinesWithin,
	MERIT_BADGE_DRY_RUN_CSV_NAME
} from '../../../../../../src/lib/features/staff/merit-badges/buildMeritBadgeSyncPayload';
import { buildMeritBadgeReportCsv, escapeCsvCell } from '../../../../../../src/lib/features/staff/merit-badges/meritBadgeReportCsv';
import type { MeritBadgeReportRow } from '../../../../../../src/lib/services/merit-badge/meritBadgeBulkSyncService';
import { getMeritBadgeTier } from '../../../../../../src/lib/services/merit-rank/meritBadge';

const obsianusIII = getMeritBadgeTier(27)!;
const ferrumI = getMeritBadgeTier(1)!;

const rows: MeritBadgeReportRow[] = [
	{
		discordUserId: '400000000000000001',
		storedUsername: '=HYPERLINK("x")',
		totalMerits: 599,
		legacyLevel: 33,
		legacySymbol: '㉝',
		desiredTier: obsianusIII,
		desiredRoleConfigured: false,
		currentTiers: [ferrumI],
		action: 'unconfigured'
	},
	{
		discordUserId: '400000000000000002',
		storedUsername: null,
		totalMerits: 0,
		legacyLevel: null,
		legacySymbol: null,
		desiredTier: null,
		desiredRoleConfigured: false,
		currentTiers: [],
		action: 'none'
	}
];

describe('escapeCsvCell', () => {
	it.each([
		['=1+1', "'=1+1"],
		['+cmd', "'+cmd"],
		['-2', "'-2"],
		['@sum', "'@sum"],
		['\tx', "'\tx"],
		['\rx', `"'\rx"`],
		['plain.name', 'plain.name'],
		['a,b', '"a,b"'],
		['say "hi"', '"say ""hi"""'],
		['line\nbreak', '"line\nbreak"']
	])('escapes %j', (input, expected) => {
		expect(escapeCsvCell(input)).toBe(expected);
	});

	it('writes numbers as numbers and null as empty', () => {
		expect(escapeCsvCell(-3)).toBe('-3');
		expect(escapeCsvCell(null)).toBe('');
	});
});

describe('buildMeritBadgeReportCsv', () => {
	it('writes a header and one escaped row per member', () => {
		expect(buildMeritBadgeReportCsv(rows).split('\r\n')).toEqual([
			'discord_user_id,stored_username,total_merits,legacy_level,legacy_symbol,desired_tier,desired_badge,desired_role_configured,current_badges,planned_action',
			`400000000000000001,"'=HYPERLINK(""x"")",599,33,㉝,27,Obsianus III,no,Ferrum I,unconfigured`,
			'400000000000000002,,0,,,,,,,none',
			''
		]);
	});
});

describe('buildMeritBadgeDryRunPayload', () => {
	it('builds the summary embed, histogram, role check and CSV attachment', () => {
		const payload = buildMeritBadgeDryRunPayload({
			report: {
				kind: 'report',
				rows,
				histogram: [{ tier: obsianusIII, count: 1 }],
				noBadgeCount: 1,
				actionCounts: { add: 0, swap: 0, remove: 0, none: 1, unconfigured: 1 }
			},
			roleCheck: { status: 'disabled' },
			roleMap: createMeritBadgeRoleMap(new Map()),
			requestId: 'req-1'
		});

		expect(payload.content).toContain('nothing was changed');
		const embed = (payload.embeds[0] as EmbedBuilder).toJSON();
		expect(embed.description).toContain('Obsianus III (tier 27): 1');
		expect(embed.description).toContain('No badge: 1');
		expect(embed.fields).toEqual(
			expect.arrayContaining([
				{ name: 'Members', value: '2', inline: true },
				{ name: 'Badge roles configured', value: '0 of 36', inline: true },
				{ name: 'Role hierarchy check', value: 'Not run: no badge role IDs are configured.' }
			])
		);
		const file = payload.files[0] as AttachmentBuilder;
		expect(file.name).toBe(MERIT_BADGE_DRY_RUN_CSV_NAME);
		expect(String(file.attachment)).toBe(buildMeritBadgeReportCsv(rows));
	});

	it('lists role check problems within the embed field limit', () => {
		const issues = Array.from({ length: 36 }, (_, index) => ({
			kind: 'not_below_bot_role' as const,
			tier: index + 1,
			tierLabel: getMeritBadgeTier(index + 1)!.label,
			roleId: '1',
			roleName: 'x'.repeat(90),
			otherRoleId: '2',
			otherRoleName: 'Arbiter'.repeat(10)
		}));

		const payload = buildMeritBadgeDryRunPayload({
			report: { kind: 'report', rows, histogram: [], noBadgeCount: 2, actionCounts: { add: 0, swap: 0, remove: 0, none: 2, unconfigured: 0 } },
			roleCheck: { status: 'checked', configuredTierCount: 36, issues },
			roleMap: createMeritBadgeRoleMap(new Map()),
			requestId: 'req-1'
		});

		const field = (payload.embeds[0] as EmbedBuilder).toJSON().fields!.find((entry) => entry.name === 'Role hierarchy check')!;
		expect(field.value.length).toBeLessThanOrEqual(1024);
		expect(field.value).toMatch(/^36 problem\(s\):\nFerrum I: not below Arbiter's highest role/);
		expect(field.value).toMatch(/…and \d+ more$/);
	});
});

describe('buildMeritBadgeLiveRunPayload', () => {
	it('explains a partial run and how to resume', () => {
		const payload = buildMeritBadgeLiveRunPayload({
			result: {
				kind: 'partial',
				stopReason: 'rate_limited',
				targetCount: 10,
				processed: 4,
				remaining: 6,
				updated: 3,
				unchanged: 1,
				memberLeft: 0,
				failed: 0,
				readFailed: 0,
				rateLimitWaits: 4,
				longRateLimitWaits: 3
			},
			requestId: 'req-2'
		});

		expect(payload.content).toContain('repeated long Discord rate-limit waits');
		expect(payload.content).toContain('Run the command again to continue');
		const embed = (payload.embeds[0] as EmbedBuilder).toJSON();
		expect(embed.title).toBe('Merit Badge Sync Stopped Early');
		expect(embed.fields).toEqual(expect.arrayContaining([{ name: 'Remaining', value: '6', inline: true }]));
	});

	it('asks to share the requestId when members failed', () => {
		const payload = buildMeritBadgeLiveRunPayload({
			result: {
				kind: 'completed',
				stopReason: null,
				targetCount: 2,
				processed: 2,
				remaining: 0,
				updated: 0,
				unchanged: 0,
				memberLeft: 0,
				failed: 2,
				readFailed: 2,
				rateLimitWaits: 0,
				longRateLimitWaits: 0
			},
			requestId: 'req-3'
		});

		expect(payload.content).toContain('Some members failed. Run again, or share requestId=`req-3` with TECH.');
	});
});

describe('buildMeritBadgeNotReadyMessage', () => {
	it('names the badge roles Arbiter cannot assign', () => {
		expect(buildMeritBadgeNotReadyMessage({ ok: false, reason: 'roles_not_editable', tierLabels: ['Aes I', 'Aes II'] })).toBe(
			"Arbiter cannot assign these badge roles (missing, managed, or not below Arbiter's highest role): Aes I, Aes II. Nothing was changed."
		);
	});
});

describe('joinLinesWithin', () => {
	it('keeps all lines when they fit', () => {
		expect(joinLinesWithin(['a', 'b'], 10)).toBe('a\nb');
	});
});
