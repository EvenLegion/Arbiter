import { describe, expect, it } from 'vitest';

import { buildMeritListPayload } from '../../../../../src/lib/features/merit/read/buildMeritListPayload';

describe('buildMeritListPayload', () => {
	it('builds the merit summary embed and page controls', () => {
		const payload = buildMeritListPayload({
			targetDiscordUserId: '123456789012345678',
			targetDisplayName: 'Alpha',
			totalMerits: 12,
			totalLinkedEvents: 3,
			page: 2,
			totalPages: 4,
			entries: [
				{
					id: 1,
					amount: 2,
					reason: 'Hosted training',
					createdAt: new Date('2025-01-02T03:04:05Z'),
					eventSession: {
						id: 55,
						name: 'Weekly Op'
					}
				}
			]
		});

		expect(payload.embeds).toHaveLength(1);
		expect(payload.embeds[0].data.title).toBe('Merits for Alpha');
		expect(payload.embeds[0].data.description).toContain('Hosted training');
		expect(payload.components).toHaveLength(1);
		expect(payload.components[0].components.map((component) => component.data.custom_id)).toEqual([
			'merit:list:page:123456789012345678:1',
			'merit:list:page-indicator:123456789012345678:2',
			'merit:list:page:123456789012345678:3'
		]);
	});
});
