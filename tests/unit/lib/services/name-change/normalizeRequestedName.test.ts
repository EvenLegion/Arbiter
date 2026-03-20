import { describe, expect, it } from 'vitest';

import { getMeritRankSymbol } from '../../../../../src/lib/services/merit-rank/meritRank';
import { normalizeRequestedName } from '../../../../../src/lib/services/name-change/normalizeRequestedName';

describe('normalizeRequestedName', () => {
	it('trims and accepts a valid base nickname', () => {
		expect(
			normalizeRequestedName({
				rawRequestedName: '  NewName  ',
				divisionPrefixes: ['NVY', 'MRN']
			})
		).toEqual({
			success: true,
			normalizedRequestedName: 'NewName',
			strippedDivisionPrefix: null
		});
	});

	it('strips a known division prefix before the separator', () => {
		expect(
			normalizeRequestedName({
				rawRequestedName: 'NVY | Callsign',
				divisionPrefixes: ['NVY', 'MRN']
			})
		).toEqual({
			success: true,
			normalizedRequestedName: 'Callsign',
			strippedDivisionPrefix: 'NVY'
		});
	});

	it('rejects an unknown prefix before the separator', () => {
		expect(
			normalizeRequestedName({
				rawRequestedName: 'ABC | Callsign',
				divisionPrefixes: ['NVY', 'MRN']
			})
		).toEqual({
			success: false,
			errorMessage:
				'Requested name is invalid. Do not include division prefixes. Use only your base nickname (no "|", spaces, or merit rank symbols).'
		});
	});

	it('rejects an empty base nickname after a known prefix', () => {
		expect(
			normalizeRequestedName({
				rawRequestedName: 'NVY |   ',
				divisionPrefixes: ['NVY', 'MRN']
			})
		).toEqual({
			success: false,
			errorMessage:
				'Requested name is invalid. Do not include division prefixes. Use only your base nickname (no "|", spaces, or merit rank symbols).'
		});
	});

	it('rejects remaining separators in the candidate name', () => {
		expect(
			normalizeRequestedName({
				rawRequestedName: 'NVY | One|Two',
				divisionPrefixes: ['NVY', 'MRN']
			})
		).toEqual({
			success: false,
			errorMessage: 'Requested name cannot contain `|`.'
		});
	});

	it('rejects spaces in the candidate name', () => {
		expect(
			normalizeRequestedName({
				rawRequestedName: 'Two Words',
				divisionPrefixes: ['NVY', 'MRN']
			})
		).toEqual({
			success: false,
			errorMessage: 'Requested name cannot contain spaces.'
		});
	});

	it('rejects merit rank symbols', () => {
		const meritRankSymbol = getMeritRankSymbol(1);
		expect(meritRankSymbol).toBeTruthy();

		expect(
			normalizeRequestedName({
				rawRequestedName: `Callsign${meritRankSymbol}`,
				divisionPrefixes: ['NVY', 'MRN']
			})
		).toEqual({
			success: false,
			errorMessage: 'Requested name cannot contain merit rank symbols.'
		});
	});
});
