import { describe, expect, it, vi } from 'vitest';

import { applyDivisionSelection } from '../../../../../src/lib/services/division-selection/divisionSelectionService';

describe('divisionSelectionService', () => {
	it('joins a division and replaces existing selectable roles', async () => {
		const removeRoles = vi.fn(async () => undefined);
		const addRole = vi.fn(async () => undefined);

		const result = await applyDivisionSelection(
			{
				listSelectableDivisions: async () => [
					{
						id: 1,
						code: 'NVY',
						name: 'Navy',
						discordRoleId: 'role-nvy'
					},
					{
						id: 2,
						code: 'MRN',
						name: 'Marines',
						discordRoleId: 'role-mrn'
					}
				],
				memberHasRole: (roleId: string) => roleId === 'role-mrn',
				removeRoles,
				addRole
			},
			{
				action: 'join',
				selectedDivisionCode: 'NVY',
				isLegionnaire: true
			}
		);

		expect(removeRoles).toHaveBeenCalledWith(['role-mrn'], 'Replacing selectable division role via button selection');
		expect(addRole).toHaveBeenCalledWith('role-nvy', 'Joined Navy division via button selection');
		expect(result).toEqual({
			kind: 'joined',
			divisionId: 1,
			divisionCode: 'NVY',
			divisionName: 'Navy',
			replacedRoleIds: ['role-mrn']
		});
	});

	it('returns no_membership when leaving without a selectable role', async () => {
		const result = await applyDivisionSelection(
			{
				listSelectableDivisions: async () => [
					{
						id: 1,
						code: 'NVY',
						name: 'Navy',
						discordRoleId: 'role-nvy'
					}
				],
				memberHasRole: () => false,
				removeRoles: vi.fn(async () => undefined),
				addRole: vi.fn(async () => undefined)
			},
			{
				action: 'leave',
				selectedDivisionCode: 'any',
				isLegionnaire: true
			}
		);

		expect(result).toEqual({
			kind: 'no_membership'
		});
	});
});
