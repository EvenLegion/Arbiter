import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	addTrackedChannel: vi.fn(),
	presentEventAddVcResult: vi.fn()
}));

vi.mock('../../../../../../src/lib/services/event-lifecycle/eventLifecycleService', () => ({
	addTrackedChannel: mocks.addTrackedChannel
}));

vi.mock('../../../../../../src/lib/features/event-merit/session/add-vc/eventAddVcResultPresenter', () => ({
	presentEventAddVcResult: mocks.presentEventAddVcResult
}));

import { runAddTrackedChannelAction } from '../../../../../../src/lib/features/event-merit/session/add-vc/runAddTrackedChannelAction';

describe('runAddTrackedChannelAction', () => {
	beforeEach(() => {
		mocks.addTrackedChannel.mockReset();
		mocks.presentEventAddVcResult.mockReset();
	});

	it('builds workflow deps inline, runs the lifecycle action, and presents the result', async () => {
		const lifecycleResult = {
			kind: 'channel_added'
		};
		const presented = {
			content: 'Added VC'
		};
		mocks.addTrackedChannel.mockResolvedValue(lifecycleResult);
		mocks.presentEventAddVcResult.mockReturnValue(presented);

		const result = await runAddTrackedChannelAction({
			guild: {
				id: 'guild-1'
			} as never,
			targetVoiceChannel: {
				id: 'voice-1'
			} as never,
			logger: {
				info: vi.fn()
			} as never,
			input: {
				actor: {
					discordUserId: '42',
					dbUserId: 'db-42',
					capabilities: {
						isStaff: true,
						isCenturion: false
					}
				},
				eventSessionId: 55,
				targetVoiceChannelId: 'voice-1',
				renameTo: null,
				actorTag: 'Staff#0001'
			}
		});

		expect(mocks.addTrackedChannel).toHaveBeenCalledWith(
			expect.objectContaining({
				findEventSession: expect.any(Function),
				findReservedChannelReservation: expect.any(Function),
				upsertTrackedChannel: expect.any(Function),
				renameVoiceChannel: expect.any(Function),
				syncTrackingSummary: expect.any(Function),
				postEventThreadLog: expect.any(Function),
				postPublicAnnouncement: expect.any(Function)
			}),
			expect.objectContaining({
				eventSessionId: 55
			})
		);
		expect(mocks.presentEventAddVcResult).toHaveBeenCalledWith(lifecycleResult);
		expect(result).toEqual(presented);
	});
});
