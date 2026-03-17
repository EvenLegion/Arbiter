import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	addTrackedChannel: vi.fn(),
	createAddTrackedChannelDeps: vi.fn(),
	presentEventAddVcResult: vi.fn()
}));

vi.mock('../../../../../../src/lib/services/event-lifecycle/eventLifecycleService', () => ({
	addTrackedChannel: mocks.addTrackedChannel
}));

vi.mock('../../../../../../src/lib/features/event-merit/session/createAddTrackedChannelDeps', () => ({
	createAddTrackedChannelDeps: mocks.createAddTrackedChannelDeps
}));

vi.mock('../../../../../../src/lib/features/event-merit/session/eventAddVcResultPresenter', () => ({
	presentEventAddVcResult: mocks.presentEventAddVcResult
}));

import { runAddTrackedChannelAction } from '../../../../../../src/lib/features/event-merit/session/runAddTrackedChannelAction';

describe('runAddTrackedChannelAction', () => {
	beforeEach(() => {
		mocks.addTrackedChannel.mockReset();
		mocks.createAddTrackedChannelDeps.mockReset();
		mocks.presentEventAddVcResult.mockReset();
	});

	it('builds workflow deps, runs the lifecycle action, and presents the result', async () => {
		const deps = {
			id: 'deps'
		};
		const lifecycleResult = {
			kind: 'channel_added'
		};
		const presented = {
			content: 'Added VC'
		};
		mocks.createAddTrackedChannelDeps.mockReturnValue(deps);
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

		expect(mocks.createAddTrackedChannelDeps).toHaveBeenCalled();
		expect(mocks.addTrackedChannel).toHaveBeenCalledWith(
			deps,
			expect.objectContaining({
				eventSessionId: 55
			})
		);
		expect(mocks.presentEventAddVcResult).toHaveBeenCalledWith(lifecycleResult);
		expect(result).toEqual(presented);
	});
});
