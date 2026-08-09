import { EventSessionChannelKind, EventSessionMessageKind, EventSessionState } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getSession: vi.fn(),
	listSessionMessages: vi.fn(),
	editReferencedMessage: vi.fn()
}));

vi.mock('../../../../../../src/integrations/prisma/repositories', () => ({
	eventRepository: {
		getSession: mocks.getSession,
		listSessionMessages: mocks.listSessionMessages
	}
}));

vi.mock('../../../../../../src/lib/features/event-merit/presentation/eventDiscordMessageGateway', () => ({
	editReferencedMessage: mocks.editReferencedMessage,
	resolveSendCapableGuildChannel: vi.fn(),
	resolveSendCapableVoiceChannel: vi.fn(),
	sendMessageToChannel: vi.fn()
}));

import { syncEventTrackingSummaryPresentation } from '../../../../../../src/lib/features/event-merit/presentation/syncEventTrackingPresentation';

describe('syncEventTrackingSummaryPresentation', () => {
	beforeEach(() => {
		mocks.getSession.mockReset();
		mocks.listSessionMessages.mockReset();
		mocks.editReferencedMessage.mockReset();
		mocks.listSessionMessages.mockResolvedValue([
			{
				kind: EventSessionMessageKind.TRACKING_SUMMARY,
				channelId: 'thread-42',
				messageId: 'summary-thread'
			},
			{
				kind: EventSessionMessageKind.TRACKING_SUMMARY_PARENT_VC,
				channelId: 'voice-42',
				messageId: 'summary-parent'
			}
		]);
		mocks.getSession.mockResolvedValue({ eventPingSentAt: null });
	});

	it('repairs stale summary writes when the durable Event Ping receipt changes during synchronization', async () => {
		const sentAt = new Date('2026-08-08T20:00:00Z');
		mocks.getSession.mockResolvedValueOnce({ eventPingSentAt: null }).mockResolvedValueOnce({ eventPingSentAt: sentAt });
		mocks.editReferencedMessage.mockResolvedValue({ id: 'updated' });

		await expect(
			syncEventTrackingSummaryPresentation({
				guild: {} as never,
				eventSession: buildSession(),
				logger: { warn: vi.fn() }
			})
		).resolves.toEqual({
			attemptedCount: 4,
			updatedCount: 4,
			failedCount: 0
		});

		expect(mocks.editReferencedMessage).toHaveBeenCalledTimes(4);
		const stalePayload = mocks.editReferencedMessage.mock.calls[0][0].payload;
		const repairedPayload = mocks.editReferencedMessage.mock.calls[2][0].payload;
		expect(stalePayload.components[0].components[1].data).toEqual(expect.objectContaining({ label: 'Event Ping', disabled: false }));
		expect(repairedPayload.components[0].components[1].data).toEqual(expect.objectContaining({ label: 'Event Ping', disabled: true }));
	});

	it('derives one disabled Event Ping payload and applies it to both stored summary copies', async () => {
		mocks.editReferencedMessage.mockResolvedValue({ id: 'updated' });

		await expect(
			syncEventTrackingSummaryPresentation({
				guild: {} as never,
				eventSession: buildSession(),
				eventPingInProgress: true,
				logger: { warn: vi.fn() }
			})
		).resolves.toEqual({
			attemptedCount: 2,
			updatedCount: 2,
			failedCount: 0
		});

		expect(mocks.editReferencedMessage).toHaveBeenCalledTimes(2);
		const firstPayload = mocks.editReferencedMessage.mock.calls[0][0].payload;
		const secondPayload = mocks.editReferencedMessage.mock.calls[1][0].payload;
		expect(firstPayload).toBe(secondPayload);
		expect(firstPayload.components[0].components.map((component: { data: { label?: string; disabled?: boolean } }) => component.data)).toEqual([
			expect.objectContaining({ label: 'End Event' }),
			expect.objectContaining({ label: 'Event Ping', disabled: true })
		]);
	});

	it.each([
		['one-copy failure', [{ id: 'updated' }, null], 1, 1],
		['two-copy failure', [null, null], 0, 2]
	] as const)('reports %s without claiming all summaries synchronized', async (_label, editResults, updatedCount, failedCount) => {
		for (const result of editResults) {
			mocks.editReferencedMessage.mockResolvedValueOnce(result);
		}

		await expect(
			syncEventTrackingSummaryPresentation({
				guild: {} as never,
				eventSession: buildSession(),
				logger: { warn: vi.fn() }
			})
		).resolves.toEqual({
			attemptedCount: 2,
			updatedCount,
			failedCount
		});
	});
});

function buildSession() {
	return {
		id: 42,
		name: 'Training Op',
		state: EventSessionState.ACTIVE,
		threadId: 'thread-42',
		eventPingSentAt: null,
		hostUser: { discordUserId: 'host-42' },
		eventTier: {
			name: 'Tier 2',
			meritType: { meritAmount: 2 }
		},
		channels: [{ kind: EventSessionChannelKind.PARENT_VC, channelId: 'voice-42' }],
		eventMessages: []
	} as never;
}
