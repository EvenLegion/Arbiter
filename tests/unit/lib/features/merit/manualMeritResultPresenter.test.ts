import { describe, expect, it } from 'vitest';

import { presentManualMeritResult } from '../../../../../src/lib/features/merit/manual-award/manualMeritResultPresenter';

describe('manualMeritResultPresenter', () => {
	it('maps command validation failures to short actionable replies', () => {
		expect(
			presentManualMeritResult({
				kind: 'forbidden'
			})
		).toEqual({
			delivery: 'fail',
			content: 'Only staff can use this command.'
		});

		expect(
			presentManualMeritResult({
				kind: 'invalid_player_selection'
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Invalid player selection. Please use the autocomplete options.'
		});

		expect(
			presentManualMeritResult({
				kind: 'invalid_merit_type'
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Invalid merit type. Please select one of the provided options.'
		});

		expect(
			presentManualMeritResult({
				kind: 'target_not_found'
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Selected player was not found. Please use the autocomplete options.'
		});
	});

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

	it('maps linked-event validation failures to event-specific guidance', () => {
		expect(
			presentManualMeritResult({
				kind: 'linked_event_not_found'
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Selected event was not found.'
		});

		expect(
			presentManualMeritResult({
				kind: 'linked_event_too_old'
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Selected event is older than 5 days and cannot be linked for this command.'
		});

		expect(
			presentManualMeritResult({
				kind: 'merit_type_not_manual_awardable'
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Selected merit type can only be awarded through event finalization.'
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
