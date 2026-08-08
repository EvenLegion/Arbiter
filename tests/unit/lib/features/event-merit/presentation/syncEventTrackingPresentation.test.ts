import { EventSessionChannelKind, EventSessionMessageKind, EventSessionState } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	listSessionMessages: vi.fn(),
	editReferencedMessage: vi.fn()
}));

vi.mock('../../../../../../src/integrations/prisma/repositories', () => ({
	eventRepository: {
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
