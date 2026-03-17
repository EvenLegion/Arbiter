import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../src/config/env/discord', () => ({
	ENV_DISCORD: {
		LGN_ROLE_ID: 'legion-role'
	}
}));

import { buildDivisionSelectionReply } from '../../../../../src/lib/features/division-selection/buildDivisionSelectionReply';

describe('buildDivisionSelectionReply', () => {
	it('includes the request id for forbidden selections', () => {
		expect(
			buildDivisionSelectionReply({
				result: {
					kind: 'forbidden'
				},
				requestId: 'req-123'
			})
		).toContain('requestId=req-123');
	});

	it('formats join success clearly', () => {
		expect(
			buildDivisionSelectionReply({
				result: {
					kind: 'joined',
					divisionId: 1,
					divisionCode: 'NVY',
					divisionName: 'Navy',
					replacedRoleIds: []
				},
				requestId: 'req-123'
			})
		).toBe('You have joined the Navy division.');
	});

	it('formats leave success clearly', () => {
		expect(
			buildDivisionSelectionReply({
				result: {
					kind: 'left',
					removedDivisionIds: [1],
					removedDivisionNames: ['Navy'],
					removedRoleIds: ['role-1']
				},
				requestId: 'req-123'
			})
		).toBe('Removed your division membership.');
	});
});
