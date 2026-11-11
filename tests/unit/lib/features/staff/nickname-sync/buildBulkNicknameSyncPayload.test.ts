import { describe, expect, it } from 'vitest';

import {
	buildBulkNicknameSyncPayload,
	buildNicknameSyncDryRunCsv,
	NICKNAME_SYNC_DRY_RUN_CSV_NAME
} from '../../../../../../src/lib/features/staff/nickname-sync/buildBulkNicknameSyncPayload';
import type { BulkNicknamePlanEntry } from '../../../../../../src/lib/services/bulk-nickname/bulkNicknameService';

const baseResult = {
	kind: 'completed' as const,
	scope: 'all' as const,
	targetCount: 1,
	attempted: 1,
	updated: 1,
	unchanged: 0,
	skippedStaff: 0,
	skippedByRule: 0,
	missingInGuild: 0,
	failed: 0,
	failures: [],
	dryRun: false,
	plan: []
};

describe('buildBulkNicknameSyncPayload', () => {
	it('builds a success summary embed', () => {
		const payload = buildBulkNicknameSyncPayload({
			result: { ...baseResult, scope: 'single' },
			includeStaff: true,
			requestId: 'req-1'
		});

		expect(payload.content).toBe('Nickname sync succeeded. requestId=`req-1`');
		expect(payload.embeds).toHaveLength(1);
		expect(payload.embeds[0].data.title).toBe('Nickname Sync Complete');
		expect(payload.embeds[0].data.color).toBe(0x22c55e);
		expect(payload.embeds[0].data.fields?.map((field) => [field.name, field.value])).toContainEqual(['Include Staff', 'Yes']);
		expect(payload).not.toHaveProperty('files');
	});

	it('renders a warning summary when some users fail', () => {
		const payload = buildBulkNicknameSyncPayload({
			result: { ...baseResult, targetCount: 4, attempted: 4, updated: 2, skippedStaff: 1, missingInGuild: 1, failed: 1 },
			includeStaff: false,
			requestId: 'req-2'
		});

		expect(payload.content).toContain('Some nickname sync operations were unsuccessful');
		expect(payload.embeds[0].data.color).toBe(0xf59e0b);
		expect(payload.embeds[0].data.fields?.map((field) => [field.name, field.value])).toContainEqual(['Mode', 'All DB Users']);
	});

	it('shows a dry run with a sample of changes and a CSV of the full plan', () => {
		const changes = Array.from({ length: 12 }, (_, index) => buildChange(String(index + 1)));
		const plan: BulkNicknamePlanEntry[] = [
			...changes,
			{ discordUserId: '900', discordUsername: 'staff-900', action: 'skipped_staff', currentNickname: 'STF | Boss', plannedNickname: null }
		];

		const payload = buildBulkNicknameSyncPayload({
			result: { ...baseResult, targetCount: 13, attempted: 13, updated: 12, skippedStaff: 1, dryRun: true, plan },
			includeStaff: false,
			requestId: 'req-3'
		});

		expect(payload.content).toBe(
			'Dry run only: no nicknames were changed. The CSV lists every change and skipped staff member. requestId=`req-3`'
		);
		expect(payload.embeds[0].data.title).toBe('Nickname Sync Dry Run');
		expect(payload.embeds[0].data.fields?.map((field) => [field.name, field.value])).toContainEqual(['Would Update', '12']);
		const description = payload.embeds[0].data.description ?? '';
		expect(description).toContain('Old\\_1 → LGN | New\\_1');
		expect(description).toContain('Old\\_10 → LGN | New\\_10');
		expect(description).not.toContain('Old\\_11');
		expect(description).toContain('…and 2 more in the CSV.');
		expect(payload.files).toHaveLength(1);
		expect(payload.files?.[0].name).toBe(NICKNAME_SYNC_DRY_RUN_CSV_NAME);
	});

	it('sends no CSV when a dry run has nothing to change or skip', () => {
		const payload = buildBulkNicknameSyncPayload({
			result: { ...baseResult, updated: 0, unchanged: 1, dryRun: true, plan: [] },
			includeStaff: true,
			requestId: 'req-4'
		});

		expect(payload.content).toBe('Dry run only: no nicknames were changed. requestId=`req-4`');
		expect(payload.embeds[0].data.description).toBeUndefined();
		expect(payload.files).toEqual([]);
	});
});

describe('buildNicknameSyncDryRunCsv', () => {
	it('writes one row per plan entry and escapes formula-like nicknames', () => {
		const csv = buildNicknameSyncDryRunCsv([
			{ discordUserId: '1', discordUsername: 'alpha', action: 'change', currentNickname: null, plannedNickname: 'LGN | Alpha' },
			{ discordUserId: '2', discordUsername: 'bravo', action: 'change', currentNickname: '=HYPERLINK("x")', plannedNickname: 'LGN | Bravo, Jr' },
			{ discordUserId: '3', discordUsername: 'carl', action: 'skipped_staff', currentNickname: 'STF | Carl', plannedNickname: null }
		]);

		expect(csv.split('\r\n')).toEqual([
			'discord_user_id,stored_username,action,current_nickname,planned_nickname',
			'1,alpha,change,,LGN | Alpha',
			'2,bravo,change,"\'=HYPERLINK(""x"")","LGN | Bravo, Jr"',
			'3,carl,skipped_staff,STF | Carl,',
			''
		]);
	});
});

function buildChange(id: string): BulkNicknamePlanEntry {
	return { discordUserId: id, discordUsername: `user-${id}`, action: 'change', currentNickname: `Old_${id}`, plannedNickname: `LGN | New_${id}` };
}
