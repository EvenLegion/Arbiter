import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockLogger } from '../../../../../support/logger';

const mocks = vi.hoisted(() => ({
	eventRepository: {
		getSession: vi.fn()
	},
	eventReviewRepository: {
		getReviewAttendee: vi.fn(),
		upsertDecision: vi.fn()
	},
	recordEventReviewDecision: vi.fn(),
	syncEventReviewPresentation: vi.fn(),
	presentRecordEventReviewDecisionResult: vi.fn()
}));

vi.mock('../../../../../../src/integrations/prisma/repositories', () => ({
	eventRepository: mocks.eventRepository,
	eventReviewRepository: mocks.eventReviewRepository
}));

vi.mock('../../../../../../src/lib/services/event-review/eventReviewService', () => ({
	recordEventReviewDecision: mocks.recordEventReviewDecision
}));

vi.mock('../../../../../../src/lib/features/event-merit/presentation/syncEventReviewPresentation', () => ({
	syncEventReviewPresentation: mocks.syncEventReviewPresentation
}));

vi.mock('../../../../../../src/lib/features/event-merit/review/actions/eventReviewActionResultPresenter', () => ({
	presentRecordEventReviewDecisionResult: mocks.presentRecordEventReviewDecisionResult
}));

import { runRecordEventReviewDecisionAction } from '../../../../../../src/lib/features/event-merit/review/actions/runRecordEventReviewDecisionAction';

describe('runRecordEventReviewDecisionAction', () => {
	beforeEach(() => {
		mocks.eventRepository.getSession.mockReset();
		mocks.eventReviewRepository.getReviewAttendee.mockReset();
		mocks.eventReviewRepository.upsertDecision.mockReset();
		mocks.recordEventReviewDecision.mockReset();
		mocks.syncEventReviewPresentation.mockReset();
		mocks.presentRecordEventReviewDecisionResult.mockReset();
	});

	it.each([EventReviewDecisionKind.MERIT, EventReviewDecisionKind.NO_MERIT, null])(
		'toggles the saved or derived decision %s using the selected duration',
		async (decision) => {
			mocks.eventReviewRepository.getReviewAttendee.mockResolvedValue({
				dbUserId: 'db-user-1',
				discordUserId: 'discord-user-1',
				discordUsername: 'alpha',
				discordNickname: 'Alpha',
				attendedSeconds: 1800,
				decision
			});
			mocks.eventRepository.getSession.mockResolvedValue({
				id: 42,
				state: EventSessionState.ENDED_PENDING_REVIEW,
				startedAt: new Date('2026-03-14T10:00:00.000Z'),
				endedAt: new Date('2026-03-14T12:00:00.000Z'),
				expectedEventDuration: 60
			});
			mocks.recordEventReviewDecision.mockResolvedValue({
				kind: 'decision_saved',
				synced: true
			});
			mocks.presentRecordEventReviewDecisionResult.mockReturnValue(null);

			const logger = createMockLogger();

			await runRecordEventReviewDecisionAction({
				parsedEventReviewButton: {
					action: 'decision',
					eventSessionId: 42,
					targetDbUserId: 'db-user-1',
					page: 9
				},
				guild: {
					id: 'guild-1'
				} as never,
				logger,
				reviewer: {
					actor: {
						discordUserId: 'reviewer-1',
						dbUserId: 'reviewer-db-1',
						capabilities: {
							isStaff: true,
							isCenturion: false,
							isOptio: false
						}
					}
				}
			});

			expect(mocks.eventReviewRepository.getReviewAttendee).toHaveBeenCalledWith({
				eventSessionId: 42,
				targetDbUserId: 'db-user-1'
			});
			expect(mocks.recordEventReviewDecision).toHaveBeenCalledWith(
				expect.any(Object),
				expect.objectContaining({
					eventSessionId: 42,
					targetDbUserId: 'db-user-1',
					page: 9,
					decision: decision === EventReviewDecisionKind.NO_MERIT ? EventReviewDecisionKind.MERIT : EventReviewDecisionKind.NO_MERIT
				})
			);
		}
	);
});
