import { describe, expect, it, vi, beforeEach } from 'vitest';

// The real incident contains private IDs and stays out of git. Only unit scenarios
// substitute its digest; the production parser always uses node's real SHA256.
const digest = vi.hoisted(() => ({ acceptSyntheticFixture: false }));
vi.mock('node:crypto', async (original) => {
	const crypto = await original<typeof import('node:crypto')>();
	return {
		...crypto,
		createHash: (...args: Parameters<typeof crypto.createHash>) =>
			digest.acceptSyntheticFixture
				? {
						update() {
							return this;
						},
						digest() {
							return 'f92db3c2fbbab8f1f8ec02beb1bd46055c94bd8c441340eaaffc5a5b8c7cd17d';
						}
					}
				: crypto.createHash(...args)
	};
});
import {
	IAE_EVENT_ID,
	IAE_THREAD_ID,
	IaeRecoveryError,
	normalizeIaeSnapshot,
	parseIaeSnapshot,
	runIaeEventRecovery,
	type IaeRecoveryDeps,
	type IaeRecoveryState,
	type IaeReviewMessage
} from '../../../../../src/lib/services/event-recovery/iaeEventRecovery';

function fixture() {
	const users = Array.from({ length: 75 }, (_, i) => ({ id: `db-${i}`, discordUserId: String(800000000000000000n + BigInt(i)) }));
	return {
		schemaVersion: 1,
		eventSessionId: IAE_EVENT_ID,
		database: {
			Event: [
				{
					id: IAE_EVENT_ID,
					name: '🔴 IAE LAUNCH DAY',
					threadId: IAE_THREAD_ID,
					hostUserId: 'host',
					eventTierId: 3,
					state: 'ENDED_PENDING_REVIEW',
					startedAt: '2026-11-14T00:17:02.898Z',
					endedAt: '2026-11-14T00:25:27.703Z',
					expectedEventDuration: 90,
					reviewFinalizedAt: null,
					reviewFinalizedByUserId: null
				}
			],
			EventParticipantStat: [],
			EventReviewDecision: [],
			Merit: [],
			EventMessage: []
		},
		participantUserMapping: users,
		redis: {
			participantsKey: 'arbiter:event-tracking:participants:1011',
			sessionKey: 'arbiter:event-tracking:session:1011',
			participants: Object.fromEntries(users.map((u, i) => [u.discordUserId, String(i < 72 ? 480 : [420, 360, 300][i - 72])])),
			metadata: { guildId: '900000000000000000', startedAtMs: '1794615422898', lastTickAtMs: '1794615928035', status: 'STOPPED' },
			activeSetMembership: 0
		}
	};
}
const actor = { discordUserId: 'staff', dbUserId: 'staff', capabilities: { isStaff: true, isCenturion: false, isOptio: false } };
function setup() {
	const raw = fixture();
	const snapshot = normalizeIaeSnapshot(raw);
	const state: IaeRecoveryState = { event: { ...snapshot.event }, stats: [], decisions: [], meritCount: 0, refs: [], users: [...snapshot.users] };
	const tracking = { participants: { ...raw.redis.participants }, metadata: { ...raw.redis.metadata }, active: false };
	const messages: IaeReviewMessage[] = [];
	const lease = { ensureOwned: vi.fn().mockResolvedValue(true), release: vi.fn().mockResolvedValue(undefined) };
	const writes = { attendance: 0, posts: 0, refs: 0 };
	const deps: IaeRecoveryDeps = {
		loadSnapshot: vi.fn().mockResolvedValue(Buffer.from(JSON.stringify(raw))),
		verifyRuntime: vi.fn().mockResolvedValue(undefined),
		readTracking: vi.fn(async () => tracking),
		readState: vi.fn(async () => state),
		findReviewMessages: vi.fn(async () => [...messages]),
		acquireOperation: vi.fn().mockResolvedValue(lease),
		persistSnapshot: vi.fn(async () => {
			if (state.stats.length) return 'none' as const;
			writes.attendance++;
			state.stats = snapshot.participants.map((p) => ({ userId: p.dbUserId, attendedSeconds: p.attendedSeconds }));
			state.decisions = snapshot.participants.map((p) => ({ targetUserId: p.dbUserId, decision: 'MERIT' }));
			return 'insert' as const;
		}),
		persistReview: vi.fn(async (_s, existing) => {
			expect(state.stats).toHaveLength(75);
			expect(state.decisions).toHaveLength(75);
			const message = existing ?? { id: 'review-1011', channelId: IAE_THREAD_ID, attendeeCount: 75 };
			const action = state.refs.length ? ('none' as const) : existing ? ('adopt' as const) : ('post' as const);
			if (!existing) {
				writes.posts++;
				messages.push(message);
			}
			if (!state.refs.length) {
				writes.refs++;
				state.refs.push({ eventSessionId: IAE_EVENT_ID, kind: 'REVIEW', channelId: IAE_THREAD_ID, messageId: message.id });
			}
			return { message, action };
		})
	};
	return { raw, snapshot, state, tracking, messages, lease, writes, deps };
}
beforeEach(() => {
	digest.acceptSyntheticFixture = true;
});
describe('temporary event1011 recovery', () => {
	it('rejects the wrong snapshot bytes with the real SHA256 implementation', () => {
		digest.acceptSyntheticFixture = false;
		expect(() => parseIaeSnapshot(Buffer.from(JSON.stringify(fixture())))).toThrow('snapshot_integrity_failed');
	});
	it('checks staff authorization before loading any incident data', async () => {
		const t = setup();
		expect(
			await runIaeEventRecovery(t.deps, { actor: { ...actor, capabilities: { ...actor.capabilities, isStaff: false } }, apply: true })
		).toEqual({ kind: 'forbidden' });
		expect(t.deps.loadSnapshot).not.toHaveBeenCalled();
		expect(t.deps.acquireOperation).not.toHaveBeenCalled();
	});
	it('defaults supplied dry run to reads only with no operation lock or mutations', async () => {
		const t = setup();
		expect(await runIaeEventRecovery(t.deps, { actor, apply: false })).toEqual({
			kind: 'dry_run_ready',
			databaseAction: 'insert',
			messageAction: 'post',
			participantCount: 75
		});
		expect(t.deps.acquireOperation).not.toHaveBeenCalled();
		expect(t.deps.persistSnapshot).not.toHaveBeenCalled();
		expect(t.deps.persistReview).not.toHaveBeenCalled();
	});
	it('verifies all75 durable rows before posting; a complete rerun changes nothing', async () => {
		const t = setup();
		const before = JSON.stringify(t.tracking);
		expect(await runIaeEventRecovery(t.deps, { actor, apply: true })).toMatchObject({
			kind: 'recovered',
			databaseAction: 'insert',
			messageAction: 'post',
			participantCount: 75
		});
		expect(await runIaeEventRecovery(t.deps, { actor, apply: true })).toMatchObject({
			kind: 'recovered',
			databaseAction: 'none',
			messageAction: 'none'
		});
		expect(t.writes).toEqual({ attendance: 1, posts: 1, refs: 1 });
		expect(t.state.meritCount).toBe(0);
		expect(t.state.event?.state).toBe('ENDED_PENDING_REVIEW');
		expect(JSON.stringify(t.tracking)).toBe(before);
		expect(t.lease.release).toHaveBeenCalledTimes(2);
	});
	it('reconciles an orphaned successful send after reference failure without a second post', async () => {
		const t = setup();
		const persist = t.deps.persistReview;
		t.deps.persistReview = vi.fn(async () => {
			t.writes.posts++;
			t.messages.push({ id: 'orphan', channelId: IAE_THREAD_ID, attendeeCount: 75 });
			throw new Error('reference failed');
		});
		await expect(runIaeEventRecovery(t.deps, { actor, apply: true })).rejects.toMatchObject({
			code: 'dependency_failed',
			phase: 'reconciling_review'
		});
		expect(t.state.stats).toHaveLength(75);
		expect(t.state.refs).toHaveLength(0);
		t.deps.persistReview = persist;
		expect(await runIaeEventRecovery(t.deps, { actor, apply: true })).toMatchObject({ messageAction: 'adopt', messageId: 'orphan' });
		expect(t.writes.posts).toBe(1);
	});
	it.each([
		'finalized',
		'awarded',
		'partial_stats',
		'changed_decision',
		'missing_user',
		'wrong_timing',
		'active_tracking',
		'changed_tracking',
		'missing_history',
		'duplicate_messages'
	])('fails closed for %s before any writes', async (scenario) => {
		const t = setup();
		if (scenario === 'finalized') t.state.event!.state = 'FINALIZED_WITH_MERITS';
		if (scenario === 'awarded') t.state.meritCount = 1;
		if (scenario === 'partial_stats') t.state.stats = [{ userId: 'db-0', attendedSeconds: 480 }];
		if (scenario === 'changed_decision') {
			await t.deps.persistSnapshot(t.snapshot, t.lease);
			t.state.decisions[0]!.decision = 'NO_MERIT';
			vi.mocked(t.deps.persistSnapshot).mockClear();
		}
		if (scenario === 'missing_user') t.state.users.pop();
		if (scenario === 'wrong_timing') t.state.event!.endedAt = '2026-11-14T01:25:27.703Z';
		if (scenario === 'active_tracking') t.tracking.active = true;
		if (scenario === 'changed_tracking') t.tracking.participants[t.raw.participantUserMapping[0]!.discordUserId] = '479';
		if (scenario === 'missing_history') t.deps.findReviewMessages = vi.fn().mockRejectedValue(new IaeRecoveryError('history_unavailable'));
		if (scenario === 'duplicate_messages')
			t.messages.push({ id: '1', channelId: IAE_THREAD_ID, attendeeCount: 75 }, { id: '2', channelId: IAE_THREAD_ID, attendeeCount: 75 });
		await expect(runIaeEventRecovery(t.deps, { actor, apply: true })).rejects.toBeInstanceOf(IaeRecoveryError);
		expect(t.deps.acquireOperation).not.toHaveBeenCalled();
		expect(t.deps.persistSnapshot).not.toHaveBeenCalled();
		expect(t.deps.persistReview).not.toHaveBeenCalled();
	});
	it('retains source and avoids presentation on failed persistence or lost lease', async () => {
		const t = setup();
		t.deps.persistSnapshot = vi.fn().mockRejectedValue(new Error('database failed'));
		await expect(runIaeEventRecovery(t.deps, { actor, apply: true })).rejects.toMatchObject({ phase: 'persisting_attendance' });
		expect(t.deps.persistReview).not.toHaveBeenCalled();
		expect(t.lease.release).toHaveBeenCalledOnce();
		const lost = setup();
		lost.lease.ensureOwned.mockResolvedValue(false);
		await expect(runIaeEventRecovery(lost.deps, { actor, apply: true })).rejects.toMatchObject({ code: 'lease_lost' });
		expect(lost.deps.persistSnapshot).not.toHaveBeenCalled();
		expect(lost.lease.release).toHaveBeenCalledOnce();
	});
	it('refuses mismatched snapshot identity, distributions and missing mappings', () => {
		const wrong = fixture();
		wrong.eventSessionId = 1012;
		expect(() => normalizeIaeSnapshot(wrong)).toThrow();
		const counts = fixture();
		counts.redis.participants[counts.participantUserMapping[0]!.discordUserId] = '300';
		expect(() => normalizeIaeSnapshot(counts)).toThrow();
		const unmapped = fixture();
		unmapped.participantUserMapping[0]!.discordUserId = '999';
		expect(() => normalizeIaeSnapshot(unmapped)).toThrow('snapshot_unmapped');
	});
});
