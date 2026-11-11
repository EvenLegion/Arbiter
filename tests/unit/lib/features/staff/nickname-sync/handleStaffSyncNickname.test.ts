import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	prepareGuildInteraction: vi.fn(),
	parseDiscordUserIdInput: vi.fn(),
	createStaffBulkNicknameSyncDeps: vi.fn(),
	syncBulkNicknames: vi.fn()
}));

vi.mock('../../../../../../src/lib/discord/interactions/prepareGuildInteraction', () => ({
	prepareGuildInteraction: mocks.prepareGuildInteraction
}));

vi.mock('../../../../../../src/lib/discord/members/memberDirectory', () => ({
	parseDiscordUserIdInput: mocks.parseDiscordUserIdInput
}));

vi.mock('../../../../../../src/lib/features/staff/nickname-sync/createStaffBulkNicknameSyncDeps', () => ({
	createStaffBulkNicknameSyncDeps: mocks.createStaffBulkNicknameSyncDeps
}));

vi.mock('../../../../../../src/lib/services/bulk-nickname/bulkNicknameService', () => ({
	syncBulkNicknames: mocks.syncBulkNicknames
}));

import { handleStaffSyncNickname } from '../../../../../../src/lib/features/staff/nickname-sync/handleStaffSyncNickname';

const counts = {
	kind: 'completed',
	scope: 'all',
	targetCount: 2,
	attempted: 2,
	updated: 1,
	unchanged: 0,
	skippedStaff: 1,
	skippedByRule: 0,
	missingInGuild: 0,
	failed: 1,
	failures: [{ discordUserId: '3', discordUsername: 'carl', dbUserId: 'db-3', reason: 'Failed to sync nickname: nickname-too-long' }]
};

describe('handleStaffSyncNickname', () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) {
			mock.mockReset();
		}
		mocks.parseDiscordUserIdInput.mockReturnValue(undefined);
		mocks.createStaffBulkNicknameSyncDeps.mockReturnValue({});
	});

	it('keeps the live run when dry_run is omitted', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.syncBulkNicknames.mockResolvedValue({ ...counts, dryRun: false, plan: [] });

		await handleStaffSyncNickname({ interaction: createInteraction({}), context: createContext() as never });

		expect(mocks.syncBulkNicknames).toHaveBeenCalledWith({}, { requestedDiscordUserId: undefined, includeStaff: false, dryRun: false });
		expect(prepared.logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ dryRun: false, failures: counts.failures }),
			'nickname.sync.completed_with_failures'
		);
		expect(prepared.responder.safeEditReply).toHaveBeenLastCalledWith(
			expect.objectContaining({ content: expect.stringContaining('Some nickname sync operations were unsuccessful') }),
			{ logRawError: true }
		);
	});

	it('runs a dry run and logs counts only, with no nickname plan or failure list', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.syncBulkNicknames.mockResolvedValue({
			...counts,
			dryRun: true,
			plan: [
				{
					discordUserId: '1',
					discordUsername: 'alpha',
					action: 'change',
					currentNickname: 'Secret Old',
					plannedNickname: 'LGN | Secret New'
				},
				{ discordUserId: '2', discordUsername: 'boss', action: 'skipped_staff', currentNickname: 'STF | Secret Boss', plannedNickname: null }
			]
		});

		await handleStaffSyncNickname({
			interaction: createInteraction({ dry_run: true, include_staff: false }),
			context: createContext() as never
		});

		expect(mocks.syncBulkNicknames).toHaveBeenCalledWith({}, { requestedDiscordUserId: undefined, includeStaff: false, dryRun: true });
		expect(prepared.logger.warn).toHaveBeenCalledTimes(1);
		const [bindings, event] = prepared.logger.warn.mock.calls[0];
		expect(event).toBe('nickname.sync.dry_run_completed_with_failures');
		expect(bindings).not.toHaveProperty('plan');
		expect(bindings).not.toHaveProperty('failures');
		expect(JSON.stringify(bindings)).not.toContain('Secret');
		expect(JSON.stringify(bindings)).not.toContain('carl');
		expect(bindings).toMatchObject({ dryRun: true, updated: 1, skippedStaff: 1, failed: 1, planRows: 2, includeStaff: false });
		expect(prepared.responder.safeEditReply).toHaveBeenLastCalledWith(
			expect.objectContaining({ content: expect.stringContaining('Dry run only'), files: [expect.anything()] }),
			{ logRawError: false }
		);
	});
});

function createPrepared() {
	return {
		guild: { id: 'guild-1' },
		logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		responder: {
			safeEditReply: vi.fn(async () => undefined),
			fail: vi.fn(async () => undefined)
		}
	};
}

function createInteraction(options: { dry_run?: boolean; include_staff?: boolean }) {
	return {
		options: {
			getBoolean: vi.fn((name: string) => (options as Record<string, boolean | undefined>)[name] ?? null),
			getString: vi.fn(() => null)
		}
	} as never;
}

function createContext() {
	return { requestId: 'req-1', logger: { child: vi.fn() } };
}
