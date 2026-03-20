import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createInteractionResponder: vi.fn(),
	resolveConfiguredGuild: vi.fn(),
	resolveInteractionActor: vi.fn(),
	openNameChangeReviewEditModal: vi.fn(),
	reviewNameChangeAction: vi.fn()
}));

vi.mock('../../../../../../src/lib/discord/interactions/interactionResponder', () => ({
	createInteractionResponder: mocks.createInteractionResponder
}));

vi.mock('../../../../../../src/lib/discord/interactions/interactionPreflight', () => ({
	resolveConfiguredGuild: mocks.resolveConfiguredGuild,
	resolveInteractionActor: mocks.resolveInteractionActor
}));

vi.mock('../../../../../../src/lib/features/ticket/review/handlers/openNameChangeReviewEditModal', () => ({
	openNameChangeReviewEditModal: mocks.openNameChangeReviewEditModal
}));

vi.mock('../../../../../../src/lib/features/ticket/review/handlers/reviewNameChangeAction', () => ({
	reviewNameChangeAction: mocks.reviewNameChangeAction
}));

import { handleNameChangeReviewButton } from '../../../../../../src/lib/features/ticket/review/handlers/handleNameChangeReviewButton';

describe('handleNameChangeReviewButton', () => {
	beforeEach(() => {
		mocks.createInteractionResponder.mockReset();
		mocks.resolveConfiguredGuild.mockReset();
		mocks.resolveInteractionActor.mockReset();
		mocks.openNameChangeReviewEditModal.mockReset();
		mocks.reviewNameChangeAction.mockReset();
	});

	it('opens the edit modal for edit actions', async () => {
		const responder = {
			fail: vi.fn()
		};
		const logger = createLogger();
		const reviewer = {
			actor: {
				discordUserId: 'staff-1',
				dbUserId: null,
				capabilities: {
					isStaff: true,
					isCenturion: false
				}
			}
		};
		mocks.createInteractionResponder.mockReturnValue(responder);
		mocks.resolveConfiguredGuild.mockResolvedValue({
			id: 'guild-1'
		});
		mocks.resolveInteractionActor.mockResolvedValue(reviewer);

		await handleNameChangeReviewButton({
			interaction: createInteraction(),
			parsedNameChangeReviewButton: {
				action: 'edit',
				requestId: 12
			},
			context: {
				logger: {
					child: vi.fn(() => logger)
				}
			} as never
		});

		expect(mocks.openNameChangeReviewEditModal).toHaveBeenCalledWith({
			interaction: expect.anything(),
			requestId: 12,
			reviewerActor: reviewer.actor,
			logger,
			responder
		});
		expect(mocks.reviewNameChangeAction).not.toHaveBeenCalled();
	});

	it('routes approve and deny actions through the review workflow', async () => {
		const responder = {
			fail: vi.fn()
		};
		const logger = createLogger();
		const guild = {
			id: 'guild-1'
		};
		const reviewer = {
			dbUser: {
				id: 'db-staff-1'
			},
			actor: {
				discordUserId: 'staff-1',
				dbUserId: 'db-staff-1',
				capabilities: {
					isStaff: true,
					isCenturion: false
				},
				discordTag: 'staff#0001'
			}
		};
		mocks.createInteractionResponder.mockReturnValue(responder);
		mocks.resolveConfiguredGuild.mockResolvedValue(guild);
		mocks.resolveInteractionActor.mockResolvedValue(reviewer);

		await handleNameChangeReviewButton({
			interaction: createInteraction(),
			parsedNameChangeReviewButton: {
				action: 'approve',
				requestId: 21
			},
			context: {
				logger: {
					child: vi.fn(() => logger)
				}
			} as never
		});

		expect(mocks.reviewNameChangeAction).toHaveBeenCalledWith({
			interaction: expect.anything(),
			requestId: 21,
			decision: 'approve',
			guild,
			context: expect.anything(),
			logger,
			responder,
			reviewer
		});
		expect(mocks.openNameChangeReviewEditModal).not.toHaveBeenCalled();
	});
});

function createLogger() {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	};
}

function createInteraction() {
	return {
		user: {
			id: 'staff-1',
			tag: 'staff#0001'
		}
	} as never;
}
