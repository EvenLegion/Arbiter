import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	prepareGuildInteraction: vi.fn(),
	resolveGuildMember: vi.fn(),
	createEventDraft: vi.fn(),
	resolveEventStartCommand: vi.fn(),
	presentEventStartResult: vi.fn(),
	createEventDraftRuntime: vi.fn()
}));

vi.mock('../../../../../../src/lib/discord/interactions/prepareGuildInteraction', () => ({
	prepareGuildInteraction: mocks.prepareGuildInteraction
}));

vi.mock('../../../../../../src/lib/discord/interactions/interactionPreflight', () => ({
	resolveGuildMember: mocks.resolveGuildMember
}));

vi.mock('../../../../../../src/lib/services/event-lifecycle', () => ({
	createEventDraft: mocks.createEventDraft
}));

vi.mock('../../../../../../src/lib/features/event-merit/session/draft/resolveEventStartCommand', () => ({
	resolveEventStartCommand: mocks.resolveEventStartCommand
}));

vi.mock('../../../../../../src/lib/features/event-merit/session/draft/eventStartResultPresenter', () => ({
	presentEventStartResult: mocks.presentEventStartResult
}));

vi.mock('../../../../../../src/lib/features/event-merit/session/draft/eventDraftRuntime', () => ({
	createEventDraftRuntime: mocks.createEventDraftRuntime
}));

import { handleEventStart } from '../../../../../../src/lib/features/event-merit/session/draft/handleEventStart';

describe('handleEventStart', () => {
	beforeEach(() => {
		mocks.prepareGuildInteraction.mockReset();
		mocks.resolveGuildMember.mockReset();
		mocks.createEventDraft.mockReset();
		mocks.resolveEventStartCommand.mockReset();
		mocks.presentEventStartResult.mockReset();
		mocks.createEventDraftRuntime.mockReset();
	});

	it('edits the deferred reply when command resolution rejects the start request', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.resolveGuildMember.mockResolvedValue({
			id: 'issuer-1',
			voice: {
				channelId: 'voice-1'
			}
		});
		mocks.resolveEventStartCommand.mockResolvedValue({
			kind: 'fail',
			delivery: 'editReply',
			content: 'You must be in a voice channel to start an event.'
		});

		await handleEventStart({
			interaction: createInteraction(),
			context: {
				requestId: 'req-1'
			} as never
		});

		expect(mocks.createEventDraft).not.toHaveBeenCalled();
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: 'You must be in a voice channel to start an event.'
		});
	});

	it('creates the draft, deletes the reply, and logs the created session', async () => {
		const prepared = createPrepared();
		const interaction = createInteraction();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.resolveGuildMember.mockResolvedValue({
			id: 'issuer-1',
			voice: {
				channelId: 'voice-1'
			}
		});
		mocks.resolveEventStartCommand.mockResolvedValue({
			kind: 'ready',
			trackingChannel: {
				id: 'tracking-1'
			},
			createDraftInput: {
				hostDbUserId: 'host-1',
				hostDiscordUserId: 'issuer-1',
				issuerTag: 'issuer#0001',
				eventTierId: 2,
				eventName: 'Friday Op',
				primaryVoiceChannelId: 'voice-1'
			}
		});
		mocks.createEventDraftRuntime.mockReturnValue({
			runtime: true
		});
		mocks.createEventDraft.mockResolvedValue({
			kind: 'draft_created',
			eventSessionId: 42,
			trackingThreadId: 'thread-42'
		});
		mocks.presentEventStartResult.mockReturnValue({
			delivery: 'deleteReply'
		});

		await handleEventStart({
			interaction,
			context: {
				requestId: 'req-2'
			} as never
		});

		expect(mocks.createEventDraft).toHaveBeenCalledWith(
			{
				runtime: true
			},
			expect.objectContaining({
				eventTierId: 2,
				eventName: 'Friday Op'
			})
		);
		expect(interaction.deleteReply).toHaveBeenCalled();
		expect(prepared.logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				eventSessionId: 42,
				trackingThreadId: 'thread-42'
			}),
			'event.session.created'
		);
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

function createInteraction() {
	return {
		user: {
			id: 'issuer-1',
			tag: 'issuer#0001'
		},
		options: {
			getString: vi.fn((name: string) => {
				if (name === 'tier_level') {
					return '2';
				}
				if (name === 'event_name') {
					return 'Friday Op';
				}
				return null;
			})
		},
		deleteReply: vi.fn().mockResolvedValue(undefined)
	} as never;
}
