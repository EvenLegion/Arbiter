import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createInteractionResponder: vi.fn(),
	prepareGuildInteraction: vi.fn(),
	submitNameChangeRequest: vi.fn(),
	presentNameChangeTicketResult: vi.fn()
}));

vi.mock('../../../../../../src/lib/discord/interactions/interactionResponder', () => ({
	createInteractionResponder: mocks.createInteractionResponder
}));

vi.mock('../../../../../../src/lib/discord/interactions/prepareGuildInteraction', () => ({
	prepareGuildInteraction: mocks.prepareGuildInteraction
}));

vi.mock('../../../../../../src/lib/services/name-change/nameChangeService', () => ({
	submitNameChangeRequest: mocks.submitNameChangeRequest
}));

vi.mock('../../../../../../src/lib/features/ticket/request/presentNameChangeTicketResult', () => ({
	presentNameChangeTicketResult: mocks.presentNameChangeTicketResult
}));

import { handleNameChangeTicket } from '../../../../../../src/lib/features/ticket/request/handleNameChangeTicket';

describe('handleNameChangeTicket', () => {
	beforeEach(() => {
		mocks.createInteractionResponder.mockReset();
		mocks.prepareGuildInteraction.mockReset();
		mocks.submitNameChangeRequest.mockReset();
		mocks.presentNameChangeTicketResult.mockReset();
	});

	it('fails before guild preparation when requested name or reason is blank', async () => {
		const initialResponder = {
			fail: vi.fn().mockResolvedValue(undefined)
		};
		const logger = {
			info: vi.fn(),
			error: vi.fn()
		};
		mocks.createInteractionResponder.mockReturnValue(initialResponder);

		await handleNameChangeTicket({
			interaction: createInteraction({
				requestedName: '   ',
				reason: '   '
			}),
			context: {
				requestId: 'req-1',
				logger: {
					child: vi.fn(() => logger)
				}
			} as never
		});

		expect(initialResponder.fail).toHaveBeenCalledWith('Requested name and reason are required.');
		expect(mocks.prepareGuildInteraction).not.toHaveBeenCalled();
	});

	it('submits the request and edits the deferred reply with the presented response', async () => {
		const initialResponder = {
			fail: vi.fn().mockResolvedValue(undefined)
		};
		const logger = {
			info: vi.fn(),
			error: vi.fn()
		};
		const prepared = createPrepared();
		mocks.createInteractionResponder.mockReturnValue(initialResponder);
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.submitNameChangeRequest.mockResolvedValue({
			kind: 'created',
			requestId: 7,
			reviewThreadId: 'thread-7',
			requestedName: 'WhyIt',
			strippedDivisionPrefix: null
		});
		mocks.presentNameChangeTicketResult.mockReturnValue({
			delivery: 'editReply',
			content: 'Name change request created.'
		});

		await handleNameChangeTicket({
			interaction: createInteraction({
				requestedName: 'WhyIt',
				reason: 'rename please'
			}),
			context: {
				requestId: 'req-2',
				logger: {
					child: vi.fn(() => logger)
				}
			} as never
		});

		expect(mocks.submitNameChangeRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				getDivisionPrefixes: expect.any(Function),
				getRequester: expect.any(Function),
				validateRequestedNickname: expect.any(Function),
				createRequest: expect.any(Function),
				createReviewThread: expect.any(Function),
				saveReviewThreadReference: expect.any(Function)
			}),
			{
				actor: {
					discordUserId: 'requester-1',
					dbUserId: null,
					capabilities: {
						isStaff: false,
						isCenturion: false
					}
				},
				rawRequestedName: 'WhyIt',
				reason: 'rename please',
				requesterTag: 'requester#0001'
			}
		);
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				nameChangeRequestId: 7,
				requestedName: 'WhyIt'
			}),
			'name_change.request.submitted'
		);
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: 'Name change request created.'
		});
	});
});

function createPrepared() {
	return {
		guild: {
			id: 'guild-1'
		},
		logger: {
			info: vi.fn(),
			error: vi.fn()
		},
		responder: {
			safeEditReply: vi.fn().mockResolvedValue(undefined),
			fail: vi.fn().mockResolvedValue(undefined)
		}
	};
}

function createInteraction({ requestedName, reason }: { requestedName: string; reason: string }) {
	return {
		user: {
			id: 'requester-1',
			tag: 'requester#0001',
			username: 'requester'
		},
		options: {
			getString: vi.fn((name: string) => {
				if (name === 'requested_name') {
					return requestedName;
				}
				if (name === 'reason') {
					return reason;
				}
				return null;
			})
		}
	} as never;
}
