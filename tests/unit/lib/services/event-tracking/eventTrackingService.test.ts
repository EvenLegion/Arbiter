import { EventSessionChannelKind, EventSessionState } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { tickAllActiveEventTrackingSessions, tickTrackedEventSession } from '../../../../../src/lib/services/event-tracking/eventTrackingService';
import { MissingTrackedChannelWarningStore } from '../../../../../src/lib/services/event-tracking/missingTrackedChannelWarningStore';
import { createMockExecutionContext, createMockLogger } from '../../../../support/logger';

describe('eventTrackingService', () => {
	it('stops stale sessions and ticks active ones', async () => {
		const warningStore = new MissingTrackedChannelWarningStore();
		const stopTrackingSession = vi.fn().mockResolvedValue(undefined);
		const applyTrackingTick = vi.fn().mockResolvedValue({
			applied: true
		});
		const logger = createMockLogger();

		const result = await tickAllActiveEventTrackingSessions(
			{
				listActiveTrackingSessionIds: vi.fn().mockResolvedValue([1, 2]),
				listActiveSessions: vi.fn().mockResolvedValue([buildTrackedSession(2)]),
				stopTrackingSession,
				resolveGuild: vi.fn().mockResolvedValue({
					id: 'guild-1'
				}),
				resolveVoiceChannel: vi.fn().mockResolvedValue({
					members: new Map([
						[
							'user-1',
							{
								id: 'user-1',
								user: {
									bot: false
								}
							}
						]
					])
				}),
				applyTrackingTick,
				tickDurationSeconds: 30,
				warningStore
			},
			{
				context: createMockExecutionContext({
					logger
				})
			}
		);

		expect(result).toEqual({
			activeSessionIds: [1, 2],
			staleEventSessionIds: [1],
			tickedSessionCount: 1
		});
		expect(stopTrackingSession).toHaveBeenCalledWith({
			eventSessionId: 1
		});
		expect(applyTrackingTick).toHaveBeenCalledWith({
			eventSessionId: 2,
			attendeeDiscordUserIds: ['user-1'],
			tickDurationSeconds: 30
		});
		expect(logger.warn).toHaveBeenCalled();
	});

	it('deduplicates attendees and returns applied state per session', async () => {
		const result = await tickTrackedEventSession(
			{
				resolveVoiceChannel: vi
					.fn()
					.mockResolvedValueOnce({
						members: new Map([
							[
								'user-1',
								{
									id: 'user-1',
									user: {
										bot: false
									}
								}
							]
						])
					})
					.mockResolvedValueOnce({
						members: new Map([
							[
								'user-1',
								{
									id: 'user-1',
									user: {
										bot: false
									}
								}
							],
							[
								'bot-1',
								{
									id: 'bot-1',
									user: {
										bot: true
									}
								}
							]
						])
					}),
				applyTrackingTick: vi.fn().mockResolvedValue({
					applied: true
				}),
				tickDurationSeconds: 60,
				warningStore: new MissingTrackedChannelWarningStore()
			},
			{
				guild: {
					id: 'guild-1'
				} as never,
				session: buildTrackedSession(5, {
					channels: [
						{
							channelId: 'vc-1',
							kind: EventSessionChannelKind.PARENT_VC
						},
						{
							channelId: 'vc-2',
							kind: EventSessionChannelKind.CHILD_VC
						}
					]
				}),
				context: createMockExecutionContext()
			}
		);

		expect(result).toEqual({
			eventSessionId: 5,
			trackedVoiceChannelCount: 2,
			attendeeCount: 1,
			applied: true
		});
	});
});

function buildTrackedSession(id: number, overrides: Partial<{ channels: Array<{ channelId: string; kind: EventSessionChannelKind }> }> = {}) {
	return {
		id,
		state: EventSessionState.ACTIVE,
		channels: overrides.channels ?? [
			{
				channelId: 'vc-1',
				kind: EventSessionChannelKind.PARENT_VC
			}
		]
	} as never;
}
