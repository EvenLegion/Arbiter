import { describe, expect, it } from 'vitest';

import { parseMeritListButtonCustomId } from '../../../../../src/lib/features/merit/read/meritListButtonCustomId';

describe('parseMeritListButtonCustomId', () => {
	it('parses valid page buttons', () => {
		expect(
			parseMeritListButtonCustomId({
				customId: 'merit:list:page:123456789012345678:2'
			})
		).toEqual({
			action: 'page',
			targetDiscordUserId: '123456789012345678',
			page: 2
		});
	});

	it('rejects invalid page values', () => {
		expect(
			parseMeritListButtonCustomId({
				customId: 'merit:list:page:123456789012345678:not-a-number'
			})
		).toBeNull();
	});

	it('rejects invalid user ids', () => {
		expect(
			parseMeritListButtonCustomId({
				customId: 'merit:list:page:user:2'
			})
		).toBeNull();
	});

	it('rejects invalid actions', () => {
		expect(
			parseMeritListButtonCustomId({
				customId: 'merit:list:refresh:123456789012345678:2'
			})
		).toBeNull();
	});

	it('rejects invalid part counts', () => {
		expect(
			parseMeritListButtonCustomId({
				customId: 'merit:list:page:123456789012345678'
			})
		).toBeNull();
	});
});
