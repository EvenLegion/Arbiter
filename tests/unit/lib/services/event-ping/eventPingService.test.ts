import { EventSessionChannelKind, EventSessionState } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendEventPing, type EventPingServiceDeps, type EventPingSession } from '../../../../../src/lib/services/event-ping';

describe('sendEventPing', () => {
	let deps: EventPingServiceDeps;

	beforeEach(() => {
		const session = buildSession();
		deps = {
			findEventSession: vi.fn().mockResolvedValue(session),
			acquireEventSessionOperation: vi.fn().mockResolvedValue({ kind: 'acquired', token: 'token-1' }),
			releaseEventSessionOperation: vi.fn().mockResolvedValue(true),
			syncSummary: vi.fn().mockResolvedValue({ failedCount: 0 }),
			sendAnnouncement: vi.fn().mockResolvedValue(true),
			markEventPingSent: vi.fn().mockResolvedValue(true),
			postAudit: vi.fn().mockResolvedValue(true),
			now: vi.fn().mockReturnValue(new Date('2026-08-08T20:00:00Z'))
		};
	});

	it('serializes, disables both summary copies, sends, persists, audits, and leaves Event Ping disabled', async () => {
		const result = await sendEventPing(deps, {
			actor: buildActor({ isOptio: true }),
			eventSessionId: 42
		});

		expect(result).toEqual({
			kind: 'sent',
			secondaryFailures: []
		});
		expect(deps.acquireEventSessionOperation).toHaveBeenCalledWith(42);
		expect(deps.syncSummary).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 42, eventPingSentAt: null }), true);
		expect(deps.sendAnnouncement).toHaveBeenCalledWith({
			eventSession: expect.objectContaining({ id: 42 }),
			parentVoiceChannelId: 'voice-42'
		});
		expect(deps.markEventPingSent).toHaveBeenCalledWith({
			eventSessionId: 42,
			sentAt: new Date('2026-08-08T20:00:00Z')
		});
		expect(deps.syncSummary).toHaveBeenNthCalledWith(2, expect.objectContaining({ eventPingSentAt: new Date('2026-08-08T20:00:00Z') }), false);
		expect(deps.postAudit).toHaveBeenCalledWith({
			eventSession: expect.objectContaining({ eventPingSentAt: new Date('2026-08-08T20:00:00Z') }),
			actorDiscordUserId: 'actor-42',
			outcome: 'sent'
		});
		expect(deps.releaseEventSessionOperation).toHaveBeenCalledWith(42, 'token-1');
	});

	it('restores retry and does not persist success when Discord rejects the announcement', async () => {
		vi.mocked(deps.sendAnnouncement).mockResolvedValue(false);

		await expect(sendEventPing(deps, { actor: buildActor(), eventSessionId: 42 })).resolves.toEqual({
			kind: 'announcement_failed',
			secondaryFailures: []
		});
		expect(deps.markEventPingSent).not.toHaveBeenCalled();
		expect(deps.syncSummary).toHaveBeenNthCalledWith(2, expect.objectContaining({ eventPingSentAt: null }), false);
		expect(deps.postAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'announcement_failed' }));
	});

	it('reports Discord success accurately when durable receipt persistence fails', async () => {
		vi.mocked(deps.markEventPingSent).mockRejectedValue(new Error('database unavailable'));

		await expect(sendEventPing(deps, { actor: buildActor(), eventSessionId: 42 })).resolves.toEqual({
			kind: 'receipt_failed',
			secondaryFailures: []
		});
		expect(deps.postAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'receipt_failed' }));
		expect(deps.syncSummary).toHaveBeenNthCalledWith(2, expect.objectContaining({ eventPingSentAt: null }), false);
	});

	it('records a concurrency loser without sending or changing presentation', async () => {
		vi.mocked(deps.acquireEventSessionOperation).mockResolvedValue({ kind: 'busy' });

		await expect(sendEventPing(deps, { actor: buildActor(), eventSessionId: 42 })).resolves.toEqual({
			kind: 'concurrency_conflict',
			secondaryFailures: []
		});
		expect(deps.sendAnnouncement).not.toHaveBeenCalled();
		expect(deps.syncSummary).not.toHaveBeenCalled();
		expect(deps.postAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'concurrency_conflict' }));
	});

	it('allows one ordinary send across simultaneous clicks and reports the loser accurately', async () => {
		let held = false;
		let finishSend: (() => void) | undefined;
		const sendGate = new Promise<void>((resolve) => {
			finishSend = resolve;
		});
		vi.mocked(deps.acquireEventSessionOperation).mockImplementation(async () => {
			if (held) {
				return { kind: 'busy' };
			}
			held = true;
			return { kind: 'acquired', token: 'winner-token' };
		});
		vi.mocked(deps.sendAnnouncement).mockImplementation(async () => {
			await sendGate;
			return true;
		});

		const winner = sendEventPing(deps, { actor: buildActor(), eventSessionId: 42 });
		await vi.waitFor(() => expect(deps.sendAnnouncement).toHaveBeenCalledTimes(1));
		const loser = sendEventPing(deps, { actor: buildActor(), eventSessionId: 42 });
		await expect(loser).resolves.toEqual({
			kind: 'concurrency_conflict',
			secondaryFailures: []
		});
		finishSend?.();
		await expect(winner).resolves.toEqual({
			kind: 'sent',
			secondaryFailures: []
		});

		expect(deps.sendAnnouncement).toHaveBeenCalledTimes(1);
		expect(deps.postAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'concurrency_conflict' }));
		expect(deps.postAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'sent' }));
	});

	it.each([
		['invalid_state', buildSession({ state: EventSessionState.ENDED_PENDING_REVIEW }), 'invalid_state'],
		['already_sent', buildSession({ eventPingSentAt: new Date('2026-08-08T19:00:00Z') }), 'already_sent'],
		['missing_parent_vc', buildSession({ channels: [] }), 'missing_parent_vc']
	] as const)('rejects %s without sending and writes a public attempt outcome', async (_label, session, expectedKind) => {
		vi.mocked(deps.findEventSession).mockResolvedValue(session);

		const result = await sendEventPing(deps, { actor: buildActor(), eventSessionId: 42 });

		expect(result.kind).toBe(expectedKind);
		expect(deps.sendAnnouncement).not.toHaveBeenCalled();
		expect(deps.postAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: expectedKind }));
	});

	it('rejects an unauthorized actor before loading state or writing a public audit', async () => {
		await expect(
			sendEventPing(deps, {
				actor: buildActor({ isStaff: false }),
				eventSessionId: 42
			})
		).resolves.toEqual({
			kind: 'forbidden',
			secondaryFailures: []
		});
		expect(deps.findEventSession).not.toHaveBeenCalled();
		expect(deps.postAudit).not.toHaveBeenCalled();
	});

	it('preserves primary success while surfacing summary, audit, and release partial failures', async () => {
		vi.mocked(deps.syncSummary).mockResolvedValueOnce({ failedCount: 1 }).mockResolvedValueOnce({ failedCount: 1 });
		vi.mocked(deps.postAudit).mockResolvedValue(false);
		vi.mocked(deps.releaseEventSessionOperation).mockResolvedValue(false);

		await expect(sendEventPing(deps, { actor: buildActor(), eventSessionId: 42 })).resolves.toEqual({
			kind: 'sent',
			secondaryFailures: ['disable_summary_sync', 'restore_summary_sync', 'audit', 'lock_release']
		});
	});
});

function buildSession(overrides: Partial<EventPingSession> = {}): EventPingSession {
	return {
		id: 42,
		name: 'Training Op',
		state: EventSessionState.ACTIVE,
		threadId: 'thread-42',
		eventPingSentAt: null,
		channels: [
			{
				kind: EventSessionChannelKind.PARENT_VC,
				channelId: 'voice-42'
			}
		],
		...overrides
	};
}

function buildActor(overrides: Partial<{ isStaff: boolean; isCenturion: boolean; isOptio: boolean }> = {}) {
	return {
		discordUserId: 'actor-42',
		dbUserId: null,
		capabilities: {
			isStaff: true,
			isCenturion: false,
			isOptio: false,
			...overrides
		}
	};
}
