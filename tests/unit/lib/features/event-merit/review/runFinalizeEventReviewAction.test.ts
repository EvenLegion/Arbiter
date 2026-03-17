import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	finalizeEventReviewLifecycle: vi.fn(),
	createFinalizeEventReviewLifecycleDeps: vi.fn(),
	presentFinalizeEventReviewResult: vi.fn()
}));

vi.mock('../../../../../../src/lib/services/event-lifecycle/eventLifecycleService', () => ({
	finalizeEventReviewLifecycle: mocks.finalizeEventReviewLifecycle
}));

vi.mock('../../../../../../src/lib/features/event-merit/review/eventReviewServiceAdapters', () => ({
	createFinalizeEventReviewLifecycleDeps: mocks.createFinalizeEventReviewLifecycleDeps
}));

vi.mock('../../../../../../src/lib/features/event-merit/review/eventReviewActionResultPresenter', () => ({
	presentFinalizeEventReviewResult: mocks.presentFinalizeEventReviewResult
}));

import { runFinalizeEventReviewAction } from '../../../../../../src/lib/features/event-merit/review/runFinalizeEventReviewAction';

describe('runFinalizeEventReviewAction', () => {
	beforeEach(() => {
		mocks.finalizeEventReviewLifecycle.mockReset();
		mocks.createFinalizeEventReviewLifecycleDeps.mockReset();
		mocks.presentFinalizeEventReviewResult.mockReset();
	});

	it('builds lifecycle deps, finalizes the review, and presents the message', async () => {
		const deps = {
			id: 'deps'
		};
		const lifecycleResult = {
			kind: 'finalized_with_merits'
		};
		mocks.createFinalizeEventReviewLifecycleDeps.mockReturnValue(deps);
		mocks.finalizeEventReviewLifecycle.mockResolvedValue(lifecycleResult);
		mocks.presentFinalizeEventReviewResult.mockReturnValue('Review finalized');

		const result = await runFinalizeEventReviewAction({
			parsedEventReviewButton: {
				eventSessionId: 99,
				mode: 'with'
			} as never,
			guild: {
				id: 'guild-1'
			} as never,
			context: {
				logger: {
					info: vi.fn()
				}
			} as never,
			logger: {
				info: vi.fn()
			} as never,
			reviewer: {
				actor: {
					discordUserId: '42',
					dbUserId: 'db-42',
					capabilities: {
						isStaff: true,
						isCenturion: false
					}
				}
			}
		});

		expect(mocks.createFinalizeEventReviewLifecycleDeps).toHaveBeenCalled();
		expect(mocks.finalizeEventReviewLifecycle).toHaveBeenCalledWith(deps, {
			actor: {
				discordUserId: '42',
				dbUserId: 'db-42',
				capabilities: {
					isStaff: true,
					isCenturion: false
				}
			},
			eventSessionId: 99,
			mode: 'with'
		});
		expect(result).toEqual({
			result: lifecycleResult,
			message: 'Review finalized'
		});
	});
});
