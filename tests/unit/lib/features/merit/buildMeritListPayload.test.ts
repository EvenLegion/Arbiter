import { describe, expect, it } from 'vitest';

import { createMeritBadgeEmojiMap } from '../../../../../src/config/meritBadgeEmojis';
import { createMeritBadgeRoleMap } from '../../../../../src/config/meritBadgeRoles';
import { buildMeritListPayload } from '../../../../../src/lib/features/merit/read/buildMeritListPayload';

// Passed explicitly so these tests never depend on emoji IDs in the real environment.
const NO_EMOJIS = createMeritBadgeEmojiMap(new Map());

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
					meritTypeName: 'Commander Merit',
					awardedByName: 'Staff Display',
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
		expect(payload.embeds[0].data.description).toContain('Awarded by: Staff Display');
		expect(payload.embeds[0].data.description).toContain('Commander Merit');
		expect(payload.components).toHaveLength(1);
		expect(payload.components[0].components.map((component) => component.data.custom_id)).toEqual([
			'merit:list:page:123456789012345678:1',
			'merit:list:page-indicator:123456789012345678:2',
			'merit:list:page:123456789012345678:3'
		]);
	});

	it('uses unique disabled button IDs when the list only has one page', () => {
		const payload = buildMeritListPayload({
			targetDiscordUserId: '123456789012345678',
			targetDisplayName: 'Voidager',
			totalMerits: 2,
			totalLinkedEvents: 1,
			page: 1,
			totalPages: 1,
			entries: [
				{
					id: 1,
					amount: 2,
					meritTypeName: 'Commander Merit',
					awardedByName: 'Staff Display',
					reason: 'Hosted training',
					createdAt: new Date('2025-01-02T03:04:05Z'),
					eventSession: null
				}
			]
		});

		expect(payload.components[0].components.map((component) => component.data.custom_id)).toEqual([
			'merit:list:page-disabled:prev:123456789012345678:1',
			'merit:list:page-indicator:123456789012345678:1',
			'merit:list:page-disabled:next:123456789012345678:1'
		]);
	});

	it('keeps the rank fields while no badge role is configured', () => {
		const payload = buildMeritListPayload({ ...listParams(), badgeRoles: createMeritBadgeRoleMap(new Map()) });

		expect(payload.embeds[0].data.fields?.slice(2)).toEqual([
			{ name: 'Current Rank', value: 'Level 4', inline: true },
			{ name: 'Rank Progress', value: 'To Level 5: [------------] 0%\n6 merits needed to next rank', inline: false }
		]);
	});

	it('shows the badge and badge progress once the badge tier has a role', () => {
		const badgeRoles = createMeritBadgeRoleMap(new Map(Array.from({ length: 36 }, (_, index) => [index + 1, `${100000000000000000 + index}`])));

		const payload = buildMeritListPayload({ ...listParams(), badgeRoles, badgeEmojis: NO_EMOJIS });

		expect(payload.embeds[0].data.fields?.slice(2)).toEqual([
			{ name: 'Current Badge', value: 'Argentum II', inline: true },
			{ name: 'Badge Progress', value: '[====--------] 33%\n2 merits to Argentum III', inline: false }
		]);
	});

	it('puts the badge emojis on the current badge and on both ends of the progress bar', () => {
		const badgeRoles = createMeritBadgeRoleMap(new Map(Array.from({ length: 36 }, (_, index) => [index + 1, `${100000000000000000 + index}`])));
		const badgeEmojis = createMeritBadgeEmojiMap(
			new Map([
				[8, '300000000000000008'],
				[9, '300000000000000009']
			])
		);

		const payload = buildMeritListPayload({ ...listParams(), badgeRoles, badgeEmojis });

		expect(payload.embeds[0].data.fields?.slice(2)).toEqual([
			{ name: 'Current Badge', value: '<:argentum_ii:300000000000000008> Argentum II', inline: true },
			{
				name: 'Badge Progress',
				value: '<:argentum_ii:300000000000000008> [====--------] <:argentum_iii:300000000000000009> 33%\n2 merits to Argentum III',
				inline: false
			}
		]);
	});

	it('keeps the rank progress field while the next badge has no role', () => {
		const badgeRoles = createMeritBadgeRoleMap(new Map([1, 2, 3, 4, 5, 6, 7, 8].map((tier) => [tier, `${100000000000000000 + tier}`])));

		const payload = buildMeritListPayload({ ...listParams(), badgeRoles, badgeEmojis: NO_EMOJIS });

		expect(payload.embeds[0].data.fields?.slice(2)).toEqual([
			{ name: 'Current Badge', value: 'Argentum II', inline: true },
			{ name: 'Rank Progress', value: 'To Level 5: [------------] 0%\n6 merits needed to next rank', inline: false }
		]);
	});
});

function listParams() {
	return {
		targetDiscordUserId: '123456789012345678',
		targetDisplayName: 'Alpha',
		totalMerits: 12,
		totalLinkedEvents: 3,
		page: 1,
		totalPages: 1,
		entries: []
	};
}
