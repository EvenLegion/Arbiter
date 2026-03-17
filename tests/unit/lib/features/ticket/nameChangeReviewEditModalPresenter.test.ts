import { describe, expect, it } from 'vitest';

import { presentNameChangeReviewEditModalResult } from '../../../../../src/lib/features/ticket/nameChangeReviewEditModalPresenter';

describe('nameChangeReviewEditModalPresenter', () => {
	it('maps validation failures to request-id aware failures', () => {
		expect(
			presentNameChangeReviewEditModalResult({
				kind: 'validation_failed'
			})
		).toEqual({
			kind: 'response',
			delivery: 'fail',
			content: 'Could not validate edited requested name. Please contact TECH with:',
			requestId: true
		});
	});

	it('maps edited results to thread-sync payloads', () => {
		expect(
			presentNameChangeReviewEditModalResult({
				kind: 'edited',
				requestId: 7,
				requesterDiscordUserId: 'user-1',
				previousRequestedName: 'Old',
				requestedName: 'New'
			})
		).toEqual({
			kind: 'edited',
			threadSync: {
				requestId: 7,
				previousRequestedName: 'Old',
				requestedName: 'New'
			}
		});
	});
});
