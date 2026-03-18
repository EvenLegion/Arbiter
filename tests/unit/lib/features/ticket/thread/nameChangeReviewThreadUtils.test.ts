import { describe, expect, it } from 'vitest';

import {
	hasSendMethod,
	isArchivableThread,
	trimNameChangeThreadValue
} from '../../../../../../src/lib/features/ticket/thread/nameChangeReviewThreadUtils';

describe('nameChangeReviewThreadUtils', () => {
	it('trims long thread values with ellipsis', () => {
		expect(trimNameChangeThreadValue('  abcdef  ', 5)).toBe('ab...');
	});

	it('detects sendable thread-like objects', () => {
		expect(
			hasSendMethod({
				send: async () => undefined
			})
		).toBe(true);
		expect(hasSendMethod({})).toBe(false);
	});

	it('detects archivable thread-like objects', () => {
		expect(
			isArchivableThread({
				archived: false,
				setArchived: async () => undefined
			})
		).toBe(true);
		expect(isArchivableThread({ archived: false })).toBe(false);
	});
});
