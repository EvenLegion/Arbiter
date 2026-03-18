import { describe, expect, it } from 'vitest';

import { getMeritRankSymbol } from '../../../../../src/lib/services/merit-rank/meritRank';
import {
	computeTransformedNickname,
	resolveNicknameTransformSetReason,
	stripLeadingPrefixSegments
} from '../../../../../src/lib/services/bulk-nickname/nicknameTransform';

describe('resolveNicknameTransformSetReason', () => {
	it('returns an audit reason for each mode', () => {
		expect(resolveNicknameTransformSetReason('remove-prefix')).toBe('Development nickname remove-prefix');
		expect(resolveNicknameTransformSetReason('remove-suffix')).toBe('Development nickname remove-suffix');
		expect(resolveNicknameTransformSetReason('reset')).toBe('Development nickname reset');
	});
});

describe('stripLeadingPrefixSegments', () => {
	it('removes one or more pipe-delimited prefixes', () => {
		expect(stripLeadingPrefixSegments('NVY | Pilot')).toBe('Pilot');
		expect(stripLeadingPrefixSegments('NVY | AIR | Pilot')).toBe('Pilot');
	});

	it('leaves non-prefixed names alone', () => {
		expect(stripLeadingPrefixSegments('Pilot')).toBe('Pilot');
	});
});

describe('computeTransformedNickname', () => {
	it('removes prefixes without blanking the nickname', () => {
		expect(
			computeTransformedNickname({
				mode: 'remove-prefix',
				currentNickname: 'NVY | Pilot',
				rawNickname: 'Pilot'
			})
		).toBe('Pilot');
	});

	it('removes trailing merit symbols for remove-suffix mode', () => {
		const meritRankSymbol = getMeritRankSymbol(1);
		expect(meritRankSymbol).toBeTruthy();

		expect(
			computeTransformedNickname({
				mode: 'remove-suffix',
				currentNickname: `Pilot ${meritRankSymbol}`,
				rawNickname: 'Pilot'
			})
		).toBe('Pilot');
	});

	it('resets to the raw stored nickname for reset mode', () => {
		expect(
			computeTransformedNickname({
				mode: 'reset',
				currentNickname: 'NVY | Pilot ★',
				rawNickname: '  RawPilot  '
			})
		).toBe('RawPilot');
	});

	it('falls back to the current nickname when removing prefixes would empty the name', () => {
		expect(
			computeTransformedNickname({
				mode: 'remove-prefix',
				currentNickname: 'NVY |',
				rawNickname: 'Ignored'
			})
		).toBe('NVY |');
	});
});
