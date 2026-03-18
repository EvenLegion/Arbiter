import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	listDivisions: vi.fn()
}));

vi.mock('../../../../../src/integrations/prisma/repositories', () => ({
	divisionRepository: {
		listDivisions: mocks.listDivisions
	}
}));

import { buildDivisionAutocompleteChoices, findDivisionBySelection } from '../../../../../src/lib/services/division-membership/divisionDirectory';

describe('divisionDirectory', () => {
	beforeEach(() => {
		mocks.listDivisions.mockReset();
	});

	it('finds divisions by normalized code or name selection', async () => {
		mocks.listDivisions.mockResolvedValue([
			{
				id: 1,
				code: 'NVY',
				name: 'Navy'
			},
			{
				id: 2,
				code: 'SUP',
				name: 'Support'
			}
		]);

		await expect(findDivisionBySelection(' nvy ')).resolves.toMatchObject({
			id: 1,
			code: 'NVY'
		});
		await expect(findDivisionBySelection('Support')).resolves.toMatchObject({
			id: 2,
			code: 'SUP'
		});
	});

	it('builds autocomplete choices with prefix matches first', async () => {
		mocks.listDivisions.mockResolvedValue([
			{
				id: 1,
				code: 'NVY',
				name: 'Navy'
			},
			{
				id: 2,
				code: 'ANV',
				name: 'Alpha Navy Reserve'
			}
		]);

		await expect(
			buildDivisionAutocompleteChoices({
				query: 'nav'
			})
		).resolves.toEqual([
			{
				name: 'Navy (NVY)',
				value: 'NVY'
			},
			{
				name: 'Alpha Navy Reserve (ANV)',
				value: 'ANV'
			}
		]);
	});
});
