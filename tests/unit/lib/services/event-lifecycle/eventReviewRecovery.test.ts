import { describe, expect, it, vi } from 'vitest';
import { EventSessionState } from '@prisma/client';
import { initializeEventReviewState } from '../../../../../src/lib/services/event-lifecycle/initializeEventReviewState';

function deps() {
	const participants = Array.from({ length: 75 }, (_, index) => ({
		discordUserId: `discord-${index}`,
		attendedSeconds: index < 72 ? 480 : [420, 360, 300][index - 72]!
	}));
	return {
		findEventSession: vi.fn().mockResolvedValue({
			id: 1011,
			state: EventSessionState.ENDED_PENDING_REVIEW,
			startedAt: new Date(0),
			endedAt: new Date(504000),
			expectedEventDuration: 90
		}),
		getTrackingParticipantsSnapshot: vi.fn().mockResolvedValue(participants),
		findUsersByDiscordUserIds: vi.fn().mockResolvedValue(participants.map((p, i) => ({ id: `db-${i}`, discordUserId: p.discordUserId }))),
		saveInitialization: vi.fn().mockResolvedValue(true),
		clearTrackingSession: vi.fn().mockResolvedValue(undefined),
		syncReviewMessage: vi.fn().mockResolvedValue(true),
		defaultMinAttendancePercent: 50
	};
}
describe('event review recovery', () => {
	it('initializes all 75 defaults and clears only after persistence, without awards', async () => {
		const d = deps();
		expect(await initializeEventReviewState(d, { eventSessionId: 1011 })).toMatchObject({
			kind: 'review_initialized',
			persistedParticipantCount: 75
		});
		const saved = d.saveInitialization.mock.calls[0]![0];
		expect(saved.participants).toHaveLength(75);
		expect(saved.decisions.filter((row: { decision: string }) => row.decision === 'MERIT')).toHaveLength(75);
		expect(d.saveInitialization.mock.invocationCallOrder[0]).toBeLessThan(d.clearTrackingSession.mock.invocationCallOrder[0]!);
	});
	it('does not discard tracking or present incomplete data on save failure', async () => {
		const d = deps();
		d.saveInitialization.mockRejectedValue(new Error('storage failed'));
		await expect(initializeEventReviewState(d, { eventSessionId: 1011 })).rejects.toThrow('storage failed');
		expect(d.clearTrackingSession).not.toHaveBeenCalled();
		expect(d.syncReviewMessage).not.toHaveBeenCalled();
	});
	it('reports Discord failure after committed attendance without repeating persistence', async () => {
		const d = deps();
		d.syncReviewMessage.mockResolvedValue(false);
		expect(await initializeEventReviewState(d, { eventSessionId: 1011 })).toMatchObject({
			kind: 'review_initialized_sync_failed',
			persistedParticipantCount: 75
		});
		expect(d.saveInitialization).toHaveBeenCalledOnce();
	});
	it('refuses finalized events and state races without clearing tracking', async () => {
		const finalized = deps();
		finalized.findEventSession.mockResolvedValue({ state: EventSessionState.FINALIZED_WITH_MERITS });
		expect(await initializeEventReviewState(finalized, { eventSessionId: 1011 })).toMatchObject({ kind: 'invalid_state' });
		const race = deps();
		race.saveInitialization.mockResolvedValue(false);
		expect(await initializeEventReviewState(race, { eventSessionId: 1011 })).toEqual({ kind: 'state_conflict' });
		for (const d of [finalized, race]) expect(d.clearTrackingSession).not.toHaveBeenCalled();
	});
});
