import { describe, expect, it } from 'vitest';

import {
	buildNameChangeReviewButtonCustomId,
	buildNameChangeReviewEditModalCustomId,
	parseNameChangeReviewButton,
	parseNameChangeReviewModal
} from '../../../../../../src/lib/features/ticket/review/nameChangeReviewCustomId';

describe('nameChangeReviewCustomId', () => {
	it('round-trips review button custom ids', () => {
		const customId = buildNameChangeReviewButtonCustomId({
			requestId: 42,
			action: 'approve'
		});

		expect(customId).toBe('ticket:name_change_review:approve:42');
		expect(
			parseNameChangeReviewButton({
				customId
			})
		).toEqual({
			action: 'approve',
			requestId: 42
		});
	});

	it('round-trips edit modal custom ids', () => {
		const customId = buildNameChangeReviewEditModalCustomId({
			requestId: 42
		});

		expect(customId).toBe('ticket:name_change_review:edit_modal:42');
		expect(
			parseNameChangeReviewModal({
				customId
			})
		).toEqual({
			requestId: 42
		});
	});
});
