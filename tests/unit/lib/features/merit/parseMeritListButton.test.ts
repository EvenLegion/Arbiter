import { describe, expect, it } from 'vitest';

import { parseMeritListButton } from '../../../../../src/lib/features/merit/parseMeritListButton';

describe('parseMeritListButton', () => {
	it('parses valid page buttons', () => {
		expect(
			parseMeritListButton({
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
			parseMeritListButton({
				customId: 'merit:list:page:123456789012345678:not-a-number'
			})
		).toBeNull();
	});

	it('rejects invalid user ids', () => {
		expect(
			parseMeritListButton({
				customId: 'merit:list:page:user:2'
			})
		).toBeNull();
	});

	it('rejects invalid actions', () => {
		expect(
			parseMeritListButton({
				customId: 'merit:list:refresh:123456789012345678:2'
			})
		).toBeNull();
	});

	it('rejects invalid part counts', () => {
		expect(
			parseMeritListButton({
				customId: 'merit:list:page:123456789012345678'
			})
		).toBeNull();
	});
});
