import { describe, expect, it } from 'vitest';

import {
	buildDivisionSelectionCustomId,
	parseDivisionSelectionCustomId
} from '../../../../../src/lib/features/division-selection/divisionSelectionCustomId';

describe('divisionSelectionCustomId', () => {
	it('builds and parses join custom ids', () => {
		const customId = buildDivisionSelectionCustomId({
			action: 'join',
			code: 'NVY'
		});

		expect(customId).toBe('division:join:NVY');
		expect(parseDivisionSelectionCustomId(customId)).toEqual({
			action: 'join',
			code: 'NVY'
		});
	});

	it('builds and parses leave custom ids', () => {
		const customId = buildDivisionSelectionCustomId({
			action: 'leave',
			code: 'any'
		});

		expect(customId).toBe('division:leave:any');
		expect(parseDivisionSelectionCustomId(customId)).toEqual({
			action: 'leave',
			code: 'any'
		});
	});

	it('returns null for unrelated custom ids', () => {
		expect(parseDivisionSelectionCustomId('ticket:close:123')).toBeNull();
	});
});
