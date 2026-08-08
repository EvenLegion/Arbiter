import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createInteractionResponder: vi.fn(),
	resolveConfiguredGuild: vi.fn(),
	resolveInteractionActor: vi.fn(),
	createEventPingRuntime: vi.fn(),
	sendEventPing: vi.fn(),
	presentEventPingResult: vi.fn()
}));

vi.mock('../../../../../../src/lib/discord/interactions/interactionResponder', () => ({
	createInteractionResponder: mocks.createInteractionResponder
}));

vi.mock('../../../../../../src/lib/discord/interactions/interactionPreflight', () => ({
	resolveConfiguredGuild: mocks.resolveConfiguredGuild,
	resolveInteractionActor: mocks.resolveInteractionActor
}));

vi.mock('../../../../../../src/lib/features/event-merit/session/event-ping/eventPingRuntime', () => ({
	createEventPingRuntime: mocks.createEventPingRuntime
}));

vi.mock('../../../../../../src/lib/services/event-ping', () => ({
	sendEventPing: mocks.sendEventPing
}));

vi.mock('../../../../../../src/lib/features/event-merit/session/event-ping/eventPingResultPresenter', () => ({
	presentEventPingResult: mocks.presentEventPingResult
}));

import { handleEventPingButton } from '../../../../../../src/lib/features/event-merit/session/event-ping/handleEventPingButton';

describe('handleEventPingButton', () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) {
			mock.mockReset();
		}
	});

	it('uses configured-guild capability preflight without requiring a database user and settles ephemerally', async () => {
		const responder = {
			deferEphemeralReply: vi.fn().mockResolvedValue(undefined),
			safeEditReply: vi.fn().mockResolvedValue(undefined),
			fail: vi.fn()
		};
		const actor = {
			discordUserId: 'actor-42',
			dbUserId: null,
			capabilities: { isStaff: false, isCenturion: false, isOptio: true }
		};
		const logger = createLogger();
		mocks.createInteractionResponder.mockReturnValue(responder);
		mocks.resolveConfiguredGuild.mockResolvedValue({ id: 'guild-42' });
		mocks.resolveInteractionActor.mockResolvedValue({ actor });
		mocks.createEventPingRuntime.mockReturnValue({ runtime: true });
		mocks.sendEventPing.mockResolvedValue({ kind: 'sent', secondaryFailures: [] });
		mocks.presentEventPingResult.mockReturnValue({ content: 'Event Ping sent successfully.' });

		await handleEventPingButton({
			interaction: {
				user: { id: 'actor-42', tag: 'actor#0042' }
			} as never,
			parsedEventPingButton: { action: 'send', eventSessionId: 42 },
			context: {
				requestId: 'req-42',
				logger: { child: vi.fn(() => logger) }
			} as never
		});

		expect(mocks.resolveInteractionActor).toHaveBeenCalledWith(
			expect.objectContaining({
				capabilityRequirement: 'staff-or-centurion'
			})
		);
		expect(mocks.resolveInteractionActor.mock.calls[0][0]).not.toHaveProperty('resolveDbUser');
		expect(responder.deferEphemeralReply).toHaveBeenCalledBefore(mocks.sendEventPing);
		expect(mocks.sendEventPing).toHaveBeenCalledWith(
			{ runtime: true },
			{
				actor,
				eventSessionId: 42
			}
		);
		expect(responder.safeEditReply).toHaveBeenCalledWith({ content: 'Event Ping sent successfully.' });
	});

	it('warns distinctly when announcement infrastructure rejects delivery', async () => {
		const responder = {
			deferEphemeralReply: vi.fn().mockResolvedValue(undefined),
			safeEditReply: vi.fn().mockResolvedValue(undefined),
			fail: vi.fn()
		};
		const logger = createLogger();
		mocks.createInteractionResponder.mockReturnValue(responder);
		mocks.resolveConfiguredGuild.mockResolvedValue({ id: 'guild-42' });
		mocks.resolveInteractionActor.mockResolvedValue({
			actor: {
				discordUserId: 'actor-42',
				dbUserId: null,
				capabilities: { isStaff: true, isCenturion: false, isOptio: false }
			}
		});
		mocks.createEventPingRuntime.mockReturnValue({ runtime: true });
		mocks.sendEventPing.mockResolvedValue({ kind: 'announcement_failed', secondaryFailures: [] });
		mocks.presentEventPingResult.mockReturnValue({ content: 'Event Ping was not sent.' });

		await handleEventPingButton({
			interaction: {
				user: { id: 'actor-42', tag: 'actor#0042' }
			} as never,
			parsedEventPingButton: { action: 'send', eventSessionId: 42 },
			context: {
				requestId: 'req-42',
				logger: { child: vi.fn(() => logger) }
			} as never
		});

		expect(logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({
				eventSessionId: 42,
				resultKind: 'announcement_failed'
			}),
			'event.ping.infrastructure_failed'
		);
		expect(mocks.presentEventPingResult).toHaveBeenCalledWith(expect.objectContaining({ kind: 'announcement_failed' }), 'req-42');
		expect(responder.safeEditReply).toHaveBeenCalledWith({
			content: 'Event Ping was not sent.'
		});
		expect(logger.info).not.toHaveBeenCalled();
	});
});

function createLogger() {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	};
}
