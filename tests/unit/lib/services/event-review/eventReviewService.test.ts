import { EventReviewDecisionLockedError } from '../../../../../src/lib/services/event-review/eventReviewDecisionErrors';
import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
	loadEventReviewPage,
	recordEventReviewDecision,
	refreshEventReviewPage
} from '../../../../../src/lib/services/event-review/eventReviewService';

describe('eventReviewService', () => {
	it.each([null, EventSessionState.FINALIZED_WITH_MERITS])(
		'reports a write-time review lock for state %s without syncing success',
		async (currentState) => {
			const deps = {
				findEventSession: vi.fn().mockResolvedValue({ id: 10, state: EventSessionState.ENDED_PENDING_REVIEW }),
				resolveTargetMeritEligibility: vi.fn().mockResolvedValue('eligible'),
				saveDecision: vi.fn().mockRejectedValue(new EventReviewDecisionLockedError(currentState)),
				syncReviewMessage: vi.fn()
			};
			const result = await recordEventReviewDecision(deps, {
				actor: buildActor(),
				eventSessionId: 10,
				targetDbUserId: 'attendee',
				decision: EventReviewDecisionKind.MERIT,
				page: 1
			});
			expect(result).toEqual(currentState === null ? { kind: 'event_not_found' } : { kind: 'review_locked', currentState });
			expect(deps.syncReviewMessage).not.toHaveBeenCalled();
		}
	);

	it.each(['not_org_member', 'unavailable'] as const)('rejects a forged or stale MERIT toggle for %s', async (eligibility) => {
		const deps = {
			findEventSession: vi.fn().mockResolvedValue({ id: 10, state: EventSessionState.ENDED_PENDING_REVIEW }),
			resolveTargetMeritEligibility: vi.fn().mockResolvedValue(eligibility),
			saveDecision: vi.fn(),
			syncReviewMessage: vi.fn()
		};
		expect(
			await recordEventReviewDecision(deps, {
				actor: buildActor(),
				eventSessionId: 10,
				targetDbUserId: 'outsider',
				decision: EventReviewDecisionKind.MERIT,
				page: 1
			})
		).toEqual({ kind: 'recipient_ineligible', eligibility });
		expect(deps.saveDecision).not.toHaveBeenCalled();
	});

	it('records a decision and refreshes the review message', async () => {
		const deps = {
			findEventSession: vi.fn().mockResolvedValue({
				id: 10,
				state: EventSessionState.ENDED_PENDING_REVIEW
			}),
			resolveTargetMeritEligibility: async () => 'eligible' as const,
			saveDecision: vi.fn().mockResolvedValue(undefined),
			syncReviewMessage: vi.fn().mockResolvedValue(true)
		};

		const result = await recordEventReviewDecision(deps, {
			actor: buildActor(),
			eventSessionId: 10,
			targetDbUserId: 'target-db-user',
			decision: EventReviewDecisionKind.MERIT,
			page: 2
		});

		expect(result).toEqual({
			kind: 'decision_saved',
			synced: true
		});
		expect(deps.saveDecision).toHaveBeenCalledWith({
			eventSessionId: 10,
			targetDbUserId: 'target-db-user',
			decision: EventReviewDecisionKind.MERIT
		});
		expect(deps.syncReviewMessage).toHaveBeenCalledWith({
			eventSessionId: 10,
			page: 2
		});
	});

	it('locks decisions after review finalization', async () => {
		const deps = {
			findEventSession: vi.fn().mockResolvedValue({
				id: 10,
				state: EventSessionState.FINALIZED_WITH_MERITS
			}),
			resolveTargetMeritEligibility: async () => 'eligible' as const,
			saveDecision: vi.fn().mockResolvedValue(undefined),
			syncReviewMessage: vi.fn().mockResolvedValue(true)
		};

		await expect(
			recordEventReviewDecision(deps, {
				actor: buildActor(),
				eventSessionId: 10,
				targetDbUserId: 'target-db-user',
				decision: EventReviewDecisionKind.NO_MERIT,
				page: 1
			})
		).resolves.toEqual({
			kind: 'review_locked',
			currentState: EventSessionState.FINALIZED_WITH_MERITS
		});
		expect(deps.saveDecision).not.toHaveBeenCalled();
	});

	it('loads review pages only for review-visible states', async () => {
		const reviewPage = {
			eventSession: {
				id: 10,
				name: 'Training Op',
				state: EventSessionState.ENDED_PENDING_REVIEW,
				threadId: 'thread-1',
				startedAt: new Date(),
				endedAt: new Date()
			},
			attendeeCount: 1,
			page: 1,
			pageSize: 10,
			totalPages: 1,
			attendees: []
		};

		await expect(
			loadEventReviewPage(
				{
					getReviewPage: vi.fn().mockResolvedValue(reviewPage)
				},
				{
					eventSessionId: 10,
					page: 1
				}
			)
		).resolves.toEqual({
			kind: 'page_ready',
			reviewPage
		});
	});

	it('returns invalid_state when a page is requested for a non-reviewable event state', async () => {
		await expect(
			loadEventReviewPage(
				{
					getReviewPage: vi.fn().mockResolvedValue({
						eventSession: {
							id: 10,
							name: 'Training Op',
							state: EventSessionState.ACTIVE,
							threadId: 'thread-1',
							startedAt: new Date(),
							endedAt: null
						},
						attendeeCount: 0,
						page: 1,
						pageSize: 10,
						totalPages: 1,
						attendees: []
					})
				},
				{
					eventSessionId: 10,
					page: 1
				}
			)
		).resolves.toEqual({
			kind: 'invalid_state',
			currentState: EventSessionState.ACTIVE
		});
	});

	it('refreshes a valid review page through the service layer', async () => {
		const reviewPage = {
			eventSession: {
				id: 10,
				name: 'Training Op',
				state: EventSessionState.ENDED_PENDING_REVIEW,
				threadId: 'thread-1',
				startedAt: new Date(),
				endedAt: new Date()
			},
			attendeeCount: 1,
			page: 2,
			pageSize: 10,
			totalPages: 3,
			attendees: []
		};
		const deps = {
			getReviewPage: vi.fn().mockResolvedValue(reviewPage),
			syncReviewMessage: vi.fn().mockResolvedValue(true)
		};

		await expect(
			refreshEventReviewPage(deps, {
				eventSessionId: 10,
				page: 2
			})
		).resolves.toEqual({
			kind: 'page_refreshed',
			synced: true
		});
		expect(deps.syncReviewMessage).toHaveBeenCalledWith({
			eventSessionId: 10,
			page: 2
		});
	});
});

function buildActor() {
	return {
		discordUserId: 'reviewer-1',
		dbUserId: 'reviewer-db-1',
		capabilities: {
			isStaff: true,
			isCenturion: false,
			isOptio: false
		}
	};
}
