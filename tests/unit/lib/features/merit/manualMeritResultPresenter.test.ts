import { describe, expect, it } from 'vitest';

import { presentManualMeritResult } from '../../../../../src/lib/features/merit/manual-award/manualMeritResultPresenter';

describe('manualMeritResultPresenter', () => {
	it('maps awarder lookup failures to request-id aware failures', () => {
		expect(
			presentManualMeritResult({
				kind: 'awarder_not_found'
			})
		).toEqual({
			delivery: 'fail',
			content: 'Could not resolve your member record. Please contact TECH with:',
			requestId: true
		});
	});

	it('formats awarded results through the reply builder', () => {
		expect(
			presentManualMeritResult({
				kind: 'awarded',
				meritRecordId: 1,
				targetDiscordUserId: 'user-1',
				meritTypeCode: 'ON_TIME',
				meritTypeName: 'On Time',
				meritAmount: 2,
				linkedEventName: 'Friday Op',
				reason: 'Helped lead',
				dmSent: true,
				recipientNicknameTooLong: false
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Applied **+2 merits** (On Time) to <@user-1>\nLinked event: **Friday Op**\nReason: Helped lead\nRecipient notified via DM.'
		});
	});
});
