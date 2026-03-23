import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
	loadEventReviewPage,
	recordEventReviewDecision,
	refreshEventReviewPage
} from '../../../../../src/lib/services/event-review/eventReviewService';

describe('eventReviewService', () => {
	it('records a decision and refreshes the review message', async () => {
		const deps = {
			findEventSession: vi.fn().mockResolvedValue({
				id: 10,
				state: EventSessionState.ENDED_PENDING_REVIEW
			}),
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
