import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createInteractionResponder: vi.fn(),
	resolveConfiguredGuild: vi.fn(),
	resolveInteractionActor: vi.fn(),
	activateDraftEvent: vi.fn(),
	cancelDraftEvent: vi.fn(),
	endActiveEvent: vi.fn(),
	createEventSessionTransitionRuntime: vi.fn(),
	presentEventStartButtonResult: vi.fn()
}));

vi.mock('../../../../../../src/lib/discord/interactions/interactionResponder', () => ({
	createInteractionResponder: mocks.createInteractionResponder
}));

vi.mock('../../../../../../src/lib/discord/interactions/interactionPreflight', () => ({
	resolveConfiguredGuild: mocks.resolveConfiguredGuild,
	resolveInteractionActor: mocks.resolveInteractionActor
}));

vi.mock('../../../../../../src/lib/services/event-lifecycle', () => ({
	activateDraftEvent: mocks.activateDraftEvent,
	cancelDraftEvent: mocks.cancelDraftEvent,
	endActiveEvent: mocks.endActiveEvent
}));

vi.mock('../../../../../../src/lib/features/event-merit/session/lifecycle/eventSessionTransitionRuntime', () => ({
	createEventSessionTransitionRuntime: mocks.createEventSessionTransitionRuntime
}));

vi.mock('../../../../../../src/lib/features/event-merit/session/buttons/eventStartButtonResultPresenter', () => ({
	presentEventStartButtonResult: mocks.presentEventStartButtonResult
}));

import { handleEventStartButton } from '../../../../../../src/lib/features/event-merit/session/buttons/handleEventStartButton';

describe('handleEventStartButton', () => {
	beforeEach(() => {
		mocks.createInteractionResponder.mockReset();
		mocks.resolveConfiguredGuild.mockReset();
		mocks.resolveInteractionActor.mockReset();
		mocks.activateDraftEvent.mockReset();
		mocks.cancelDraftEvent.mockReset();
		mocks.endActiveEvent.mockReset();
		mocks.createEventSessionTransitionRuntime.mockReset();
		mocks.presentEventStartButtonResult.mockReset();
	});

	it('routes confirm actions through activation and fails with the presented response', async () => {
		const responder = createResponder();
		mocks.createInteractionResponder.mockReturnValue(responder);
		mocks.resolveConfiguredGuild.mockResolvedValue({
			id: 'guild-1'
		});
		mocks.resolveInteractionActor.mockResolvedValue({
			actor: createActor()
		});
		mocks.createEventSessionTransitionRuntime.mockReturnValue({
			runtime: true
		});
		mocks.activateDraftEvent.mockResolvedValue({
			kind: 'event_not_found'
		});
		mocks.presentEventStartButtonResult.mockReturnValue({
			delivery: 'fail',
			content: 'Event session not found.'
		});

		await handleEventStartButton({
			interaction: createInteraction(),
			parsedEventStartButton: {
				action: 'confirm',
				eventSessionId: 11
			},
			context: createContext()
		});

		expect(mocks.activateDraftEvent).toHaveBeenCalledWith(
			{
				runtime: true
			},
			{
				actor: createActor(),
				eventSessionId: 11
			}
		);
		expect(responder.fail).toHaveBeenCalledWith('Event session not found.');
	});

	it('routes end actions through termination and sends follow-up guidance when review init failed', async () => {
		const responder = createResponder();
		const logger = createLogger();
		mocks.createInteractionResponder.mockReturnValue(responder);
		mocks.resolveConfiguredGuild.mockResolvedValue({
			id: 'guild-1'
		});
		mocks.resolveInteractionActor.mockResolvedValue({
			actor: createActor()
		});
		mocks.createEventSessionTransitionRuntime.mockReturnValue({
			runtime: true
		});
		mocks.endActiveEvent.mockResolvedValue({
			kind: 'ended',
			eventSession: {
				id: 22
			},
			reviewInitializationFailed: true
		});
		mocks.presentEventStartButtonResult.mockReturnValue({
			delivery: 'success',
			followUp: {
				content: 'Event ended, but review initialization failed.',
				flags: 64
			}
		});

		await handleEventStartButton({
			interaction: createInteraction(),
			parsedEventStartButton: {
				action: 'end',
				eventSessionId: 22
			},
			context: {
				requestId: 'req-2',
				logger: {
					child: vi.fn(() => logger)
				}
			} as never
		});

		expect(mocks.endActiveEvent).toHaveBeenCalledWith(
			{
				runtime: true
			},
			{
				actor: createActor(),
				actorTag: 'reviewer#0001',
				eventSessionId: 22
			}
		);
		expect(responder.safeFollowUp).toHaveBeenCalledWith({
			content: 'Event ended, but review initialization failed.',
			flags: 64
		});
		expect(logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({
				eventSessionId: 22
			}),
			'Event ended but review initialization failed'
		);
	});
});

function createContext() {
	return {
		requestId: 'req-1',
		logger: {
			child: vi.fn(() => createLogger())
		}
	} as never;
}

function createLogger() {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	};
}

function createResponder() {
	return {
		fail: vi.fn().mockResolvedValue(undefined),
		safeFollowUp: vi.fn().mockResolvedValue(undefined)
	};
}

function createActor() {
	return {
		discordUserId: 'reviewer-1',
		dbUserId: 'db-reviewer-1',
		capabilities: {
			isStaff: true,
			isCenturion: true
		}
	};
}

function createInteraction() {
	return {
		user: {
			id: 'reviewer-1',
			tag: 'reviewer#0001'
		}
	} as never;
}
