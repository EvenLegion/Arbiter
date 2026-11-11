import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMeritBadgeRoleMap } from '../../../../../../src/config/meritBadgeRoles';

const mocks = vi.hoisted(() => ({
	prepareGuildInteraction: vi.fn(),
	resolveInteractionActor: vi.fn(),
	parseDiscordUserIdInput: vi.fn(),
	createStaffMeritBadgeSyncDeps: vi.fn(),
	runMeritBadgeRoleCheck: vi.fn(),
	buildMeritBadgeCutoverReport: vi.fn(),
	runMeritBadgeBulkSync: vi.fn()
}));

vi.mock('../../../../../../src/lib/discord/interactions/prepareGuildInteraction', () => ({
	prepareGuildInteraction: mocks.prepareGuildInteraction
}));

vi.mock('../../../../../../src/lib/discord/interactions/interactionPreflight', () => ({
	resolveInteractionActor: mocks.resolveInteractionActor
}));

vi.mock('../../../../../../src/lib/discord/members/memberDirectory', () => ({
	parseDiscordUserIdInput: mocks.parseDiscordUserIdInput
}));

vi.mock('../../../../../../src/lib/features/staff/merit-badges/createStaffMeritBadgeSyncDeps', () => ({
	createStaffMeritBadgeSyncDeps: mocks.createStaffMeritBadgeSyncDeps
}));

vi.mock('../../../../../../src/lib/services/merit-badge/runMeritBadgeRoleCheck', () => ({
	runMeritBadgeRoleCheck: mocks.runMeritBadgeRoleCheck
}));

vi.mock('../../../../../../src/lib/services/merit-badge/meritBadgeBulkSyncService', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../../../../src/lib/services/merit-badge/meritBadgeBulkSyncService')>()),
	buildMeritBadgeCutoverReport: mocks.buildMeritBadgeCutoverReport,
	runMeritBadgeBulkSync: mocks.runMeritBadgeBulkSync
}));

import { handleStaffMeritBadgeSync } from '../../../../../../src/lib/features/staff/merit-badges/handleStaffMeritBadgeSync';
import { createMeritBadgeBulkRunLock } from '../../../../../../src/lib/services/merit-badge/meritBadgeBulkSyncService';

const ROLE_ID = '200000000000000001';
const roleMap = createMeritBadgeRoleMap(new Map([[1, ROLE_ID]]));

const completedResult = {
	kind: 'completed',
	stopReason: null,
	targetCount: 1,
	processed: 1,
	remaining: 0,
	updated: 1,
	unchanged: 0,
	memberLeft: 0,
	failed: 0,
	readFailed: 0,
	rateLimitWaits: 0,
	longRateLimitWaits: 0
};

describe('handleStaffMeritBadgeSync', () => {
	let deps: { roleMap: typeof roleMap; loadBotRoleAccess: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		for (const mock of Object.values(mocks)) {
			mock.mockReset();
		}
		deps = {
			roleMap,
			loadBotRoleAccess: vi.fn(async () => ({ botHasManageRoles: true, editableRoleIds: new Set([ROLE_ID]) }))
		};
		mocks.createStaffMeritBadgeSyncDeps.mockReturnValue(deps);
		mocks.resolveInteractionActor.mockResolvedValue({ member: {}, dbUser: null, actor: {} });
		mocks.parseDiscordUserIdInput.mockReturnValue(undefined);
		mocks.runMeritBadgeRoleCheck.mockResolvedValue({ status: 'checked', configuredTierCount: 1, issues: [] });
		mocks.runMeritBadgeBulkSync.mockResolvedValue(completedResult);
	});

	it.each([true, false])('refuses a non-staff actor before any read or run (dry_run=%s)', async (dryRun) => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.resolveInteractionActor.mockResolvedValue(null);
		const runLock = createMeritBadgeBulkRunLock();

		await handleStaffMeritBadgeSync({ interaction: createInteraction({ dry_run: dryRun }), context: createContext() as never, runLock });

		expect(mocks.resolveInteractionActor).toHaveBeenCalledWith(
			expect.objectContaining({ capabilityRequirement: 'staff', discordUserId: 'actor-1', guild: prepared.guild })
		);
		expect(mocks.createStaffMeritBadgeSyncDeps).not.toHaveBeenCalled();
		expect(mocks.buildMeritBadgeCutoverReport).not.toHaveBeenCalled();
		expect(mocks.runMeritBadgeBulkSync).not.toHaveBeenCalled();
		expect(runLock.tryAcquire()).not.toBeNull();
	});

	it('defaults to a dry run that never takes the run lock or starts a live run', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.buildMeritBadgeCutoverReport.mockResolvedValue({
			kind: 'report',
			rows: [],
			histogram: [],
			noBadgeCount: 0,
			actionCounts: { add: 0, swap: 0, remove: 0, none: 0, unconfigured: 0 }
		});
		const runLock = createMeritBadgeBulkRunLock();
		const held = runLock.tryAcquire();

		await handleStaffMeritBadgeSync({ interaction: createInteraction({}), context: createContext() as never, runLock });

		expect(mocks.prepareGuildInteraction).toHaveBeenCalledWith(expect.objectContaining({ defer: 'ephemeralReply' }));
		expect(mocks.runMeritBadgeBulkSync).not.toHaveBeenCalled();
		expect(deps.loadBotRoleAccess).not.toHaveBeenCalled();
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith(
			expect.objectContaining({ content: expect.stringContaining('Dry run only'), files: [expect.anything()] })
		);
		held!();
	});

	it('reports a dry-run totals read failure without a report', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.buildMeritBadgeCutoverReport.mockResolvedValue({ kind: 'read_failed' });

		await handleStaffMeritBadgeSync({ interaction: createInteraction({}), context: createContext() as never });

		expect(prepared.responder.fail).toHaveBeenCalledWith('Could not read merit totals. Nothing was changed.', { requestId: true });
	});

	it('refuses a second live run while one holds the lock', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		const runLock = createMeritBadgeBulkRunLock();
		runLock.tryAcquire();

		await handleStaffMeritBadgeSync({ interaction: createInteraction({ dry_run: false }), context: createContext() as never, runLock });

		expect(mocks.runMeritBadgeBulkSync).not.toHaveBeenCalled();
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: expect.stringContaining('A live merit badge sync is already running.')
		});
	});

	it('stops before any role call when a badge role is not editable, and releases the lock', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		deps.loadBotRoleAccess.mockResolvedValue({ botHasManageRoles: true, editableRoleIds: new Set() });
		const runLock = createMeritBadgeBulkRunLock();

		await handleStaffMeritBadgeSync({ interaction: createInteraction({ dry_run: false }), context: createContext() as never, runLock });

		expect(mocks.runMeritBadgeBulkSync).not.toHaveBeenCalled();
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: expect.stringContaining('Arbiter cannot assign these badge roles')
		});
		expect(runLock.tryAcquire()).not.toBeNull();
	});

	it('runs a live sync for the requested user and releases the lock', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue('400000000000000001');
		const runLock = createMeritBadgeBulkRunLock();

		await handleStaffMeritBadgeSync({
			interaction: createInteraction({ dry_run: false, user: '400000000000000001' }),
			context: createContext() as never,
			runLock
		});

		expect(mocks.runMeritBadgeBulkSync).toHaveBeenCalledWith(deps, { requestedDiscordUserId: '400000000000000001' });
		expect(prepared.responder.safeEditReply).toHaveBeenLastCalledWith(
			expect.objectContaining({ content: expect.stringContaining('Merit badge sync finished.') })
		);
		expect(prepared.logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ updated: 1, scope: 'single' }),
			'merit_badge.bulk_sync.completed'
		);
		expect(runLock.tryAcquire()).not.toBeNull();
	});

	it('releases the lock when a live run throws', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.runMeritBadgeBulkSync.mockRejectedValue(new Error('boom'));
		const runLock = createMeritBadgeBulkRunLock();

		await handleStaffMeritBadgeSync({ interaction: createInteraction({ dry_run: false }), context: createContext() as never, runLock });

		expect(prepared.responder.fail).toHaveBeenCalledWith('Failed to complete the merit badge sync due to an unexpected error.', {
			requestId: true
		});
		expect(runLock.tryAcquire()).not.toBeNull();
	});

	it('rejects a user value that is not a member selection', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);

		await handleStaffMeritBadgeSync({ interaction: createInteraction({ user: 'not-a-user' }), context: createContext() as never });

		expect(mocks.buildMeritBadgeCutoverReport).not.toHaveBeenCalled();
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: 'Invalid `user` value. Select a user from autocomplete. requestId=`req-1`'
		});
	});
});

function createPrepared() {
	const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
	return {
		guild: { id: 'guild-1' },
		logger,
		responder: {
			safeEditReply: vi.fn(async () => undefined),
			fail: vi.fn(async () => undefined)
		}
	};
}

function createInteraction(options: { dry_run?: boolean; user?: string }) {
	return {
		user: { id: 'actor-1' },
		options: {
			getBoolean: vi.fn((name: string) => (name === 'dry_run' ? (options.dry_run ?? null) : null)),
			getString: vi.fn((name: string) => (name === 'user' ? (options.user ?? null) : null))
		}
	} as never;
}

function createContext() {
	return { requestId: 'req-1', logger: { child: vi.fn() } };
}
