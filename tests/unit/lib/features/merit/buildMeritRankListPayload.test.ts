import { describe, expect, it } from 'vitest';

import { buildMeritRankListPayload } from '../../../../../src/lib/features/merit/rank-list/buildMeritRankListPayload';

describe('buildMeritRankListPayload', () => {
	it('builds a paginated merit rank list payload', () => {
		const payload = buildMeritRankListPayload({
			entries: Array.from({ length: 50 }, (_, index) => ({
				level: index + 1,
				lgnOrResCount: index + 10,
				lgnCount: index + 1,
				resCount: index,
				centCount: 1,
				optCount: 2,
				nvyCount: 3,
				nvyLCount: 4,
				mrnCount: 5,
				mrnLCount: 6,
				supCount: 7,
				supLCount: 8
			})),
			page: 2
		});

		expect(payload.embeds).toHaveLength(1);
		expect(payload.embeds[0]?.data.title).toBe('Merit Rank List (11-20)');
		expect(payload.embeds[0]?.data.footer?.text).toBe('Page 2/5');
		expect(payload.embeds[0]?.data.description).toContain('Counts are based on current merit totals');
		expect(payload.embeds[0]?.data.fields?.map((field) => field.name)).toEqual(['Legion / Reserve', 'Command', 'Divisions']);
		expect(payload.embeds[0]?.data.fields?.[0]?.value).toContain('LGN/RES');
		expect(payload.embeds[0]?.data.fields?.[0]?.value).toContain(' 11');
		expect(payload.embeds[0]?.data.fields?.[0]?.value).toContain(' 20');
		expect(payload.embeds[0]?.data.fields?.[2]?.value).toContain('NVY-L');
		expect(payload.embeds[0]?.data.fields?.[2]?.value).toContain('SUP-L');
		expect(payload.components).toHaveLength(1);
		expect(payload.components[0]?.components.map((component) => component.data.custom_id)).toEqual([
			'merit:rank-list:page:1',
			'merit:rank-list:page-indicator:2',
			'merit:rank-list:page:3'
		]);
	});

	it('uses unique inert ids for disabled pagination buttons', () => {
		const payload = buildMeritRankListPayload({
			entries: Array.from({ length: 3 }, (_, index) => ({
				level: index + 1,
				lgnOrResCount: 0,
				lgnCount: 0,
				resCount: 0,
				centCount: 0,
				optCount: 0,
				nvyCount: 0,
				nvyLCount: 0,
				mrnCount: 0,
				mrnLCount: 0,
				supCount: 0,
				supLCount: 0
			})),
			page: 1,
			pageSize: 10
		});

		expect(payload.components[0]?.components.map((component) => component.data.custom_id)).toEqual([
			'merit:rank-list:page-disabled:prev:1',
			'merit:rank-list:page-indicator:1',
			'merit:rank-list:page-disabled:next:1'
		]);
	});

	it('lists badge tiers 9 per page, so each page is 3 badge levels, and clamps old pages', () => {
		const entries = Array.from({ length: 36 }, (_, index) => ({ ...emptyCounts(), level: index + 1, lgnCount: index }));

		const firstPage = buildMeritRankListPayload({ entries, page: 1, ladder: 'badge' });
		const legacyPageFive = buildMeritRankListPayload({ entries, page: 5, ladder: 'badge' });

		expect(firstPage.embeds[0]?.data.title).toBe('Merit Badge List (Ferrum-Argentum)');
		expect(firstPage.embeds[0]?.data.footer?.text).toBe('Page 1/4');
		const table = firstPage.embeds[0]?.data.fields?.[0]?.value ?? '';
		expect(table).toContain('Badge        LGN/RES LGN RES\nFerrum I           0   0   0');
		expect(table).toContain('Ferrum I');
		expect(table).toContain('Argentum III');
		expect(table).not.toContain('Aurum I');
		expect(legacyPageFive.embeds[0]?.data.title).toBe('Merit Badge List (Sanguis-Supra Omnia)');
		expect(legacyPageFive.embeds[0]?.data.footer?.text).toBe('Page 4/4');
		expect(legacyPageFive.embeds[0]?.data.fields?.[0]?.value).toContain('Supra Omnia III');
		expect(legacyPageFive.components[0]?.components.map((component) => component.data.custom_id)).toEqual([
			'merit:rank-list:page:3',
			'merit:rank-list:page-indicator:4',
			'merit:rank-list:page-disabled:next:4'
		]);
	});
});

function emptyCounts() {
	return {
		level: 0,
		lgnOrResCount: 0,
		lgnCount: 0,
		resCount: 0,
		centCount: 0,
		optCount: 0,
		nvyCount: 0,
		nvyLCount: 0,
		mrnCount: 0,
		mrnLCount: 0,
		supCount: 0,
		supLCount: 0
	};
}
