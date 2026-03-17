import { describe, expect, it } from 'vitest';

import { MissingTrackedChannelWarningStore } from '../../../../src/lib/services/event-tracking/missingTrackedChannelWarningStore';

describe('MissingTrackedChannelWarningStore', () => {
	it('deduplicates repeated missing-channel warnings per session/channel pair', () => {
		const store = new MissingTrackedChannelWarningStore();

		expect(
			store.noteMissingChannel({
				eventSessionId: 1,
				channelId: 'voice-1'
			})
		).toBe(true);
		expect(
			store.noteMissingChannel({
				eventSessionId: 1,
				channelId: 'voice-1'
			})
		).toBe(false);
	});

	it('drops warnings for inactive sessions during reconciliation', () => {
		const store = new MissingTrackedChannelWarningStore();
		store.noteMissingChannel({
			eventSessionId: 1,
			channelId: 'voice-1'
		});
		store.noteMissingChannel({
			eventSessionId: 2,
			channelId: 'voice-2'
		});

		store.reconcileActiveSessionIds({
			activeEventSessionIds: [2]
		});

		expect(
			store.noteMissingChannel({
				eventSessionId: 1,
				channelId: 'voice-1'
			})
		).toBe(true);
		expect(
			store.noteMissingChannel({
				eventSessionId: 2,
				channelId: 'voice-2'
			})
		).toBe(false);
	});
});
