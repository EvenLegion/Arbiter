import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	isRuntimeClientReady: vi.fn(),
	createEventTrackingServiceDeps: vi.fn(),
	tickAllActiveEventTrackingSessions: vi.fn()
}));

vi.mock('../../../src/integrations/sapphire/runtimeGateway', () => ({
	isRuntimeClientReady: mocks.isRuntimeClientReady
}));

vi.mock('../../../src/lib/features/event-merit/tracking/createEventTrackingServiceDeps', () => ({
	createEventTrackingServiceDeps: mocks.createEventTrackingServiceDeps
}));

vi.mock('../../../src/lib/services/event-tracking/eventTrackingService', () => ({
	tickAllActiveEventTrackingSessions: mocks.tickAllActiveEventTrackingSessions
}));

import { EventTrackingTickTask } from '../../../src/scheduled-tasks/eventTrackingTick';

describe('eventTrackingTick task', () => {
	it('calls the service when the Discord client is ready', async () => {
		const task = Object.create(EventTrackingTickTask.prototype) as EventTrackingTickTask;
		mocks.isRuntimeClientReady.mockReturnValue(true);
		mocks.createEventTrackingServiceDeps.mockReturnValue({
			id: 'deps'
		});
		mocks.tickAllActiveEventTrackingSessions.mockResolvedValue(undefined);

		await task.run();

		expect(mocks.createEventTrackingServiceDeps).toHaveBeenCalled();
		expect(mocks.tickAllActiveEventTrackingSessions).toHaveBeenCalledWith(
			{
				id: 'deps'
			},
			expect.objectContaining({
				context: expect.objectContaining({
					requestId: expect.any(String)
				})
			})
		);
	});
});
