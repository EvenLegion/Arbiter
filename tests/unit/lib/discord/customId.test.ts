import { describe, expect, it } from 'vitest';

import { createCustomIdCodec, extractCustomIdParts, hasCustomIdPrefix, joinCustomId } from '../../../../src/lib/discord/customId';

describe('customId', () => {
	it('builds and parses ids through a typed codec', () => {
		const codec = createCustomIdCodec<{ action: 'view'; id: number }, { action: 'view'; id: number }>({
			prefix: ['ticket', 'view'],
			parseParts: ([rawAction, rawId]) => {
				if (rawAction !== 'view' || !rawId) {
					return null;
				}

				return {
					action: 'view',
					id: Number(rawId)
				};
			},
			buildParts: ({ action, id }) => [action, id]
		});

		const customId = codec.build({
			action: 'view',
			id: 42
		});

		expect(customId).toBe('ticket:view:view:42');
		expect(codec.matches(customId)).toBe(true);
		expect(codec.parse(customId)).toEqual({
			action: 'view',
			id: 42
		});
	});

	it('provides low-level helpers for prefix matching and part extraction', () => {
		expect(joinCustomId(['event', 'review', 55, 'page'])).toBe('event:review:55:page');
		expect(
			hasCustomIdPrefix({
				customId: 'event:review:55:page',
				prefix: ['event', 'review']
			})
		).toBe(true);
		expect(
			extractCustomIdParts({
				customId: 'event:review:55:page',
				prefix: ['event', 'review']
			})
		).toEqual(['55', 'page']);
	});
});
