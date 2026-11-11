import { DivisionKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { getMeritRankSymbol } from '../../../../../src/lib/services/merit-rank/meritRank';
import { buildUserNickname, stripTrailingMeritRankSuffix } from '../../../../../src/lib/services/nickname/buildUserNickname';

describe('buildUserNickname', () => {
	it('skips nickname computation for the guild owner', () => {
		expect(
			buildUserNickname({
				isGuildOwner: true,
				baseNickname: 'OwnerName',
				divisions: [],
				totalMerits: 0
			})
		).toEqual({
			newUserNickname: null,
			reason: 'User is the guild owner'
		});
	});

	it('applies the highest-priority division prefix to the base nickname', () => {
		expect(
			buildUserNickname({
				isGuildOwner: false,
				baseNickname: 'Callsign',
				divisions: [
					{
						id: 1,
						code: 'MAR',
						name: 'Marines',
						displayNamePrefix: 'MAR',
						kind: DivisionKind.MARINES,
						showRank: true,
						discordRoleId: '1'
					},
					{
						id: 2,
						code: 'RSV',
						name: 'Reserve',
						displayNamePrefix: 'RSV',
						kind: DivisionKind.RESERVE,
						showRank: true,
						discordRoleId: '2'
					}
				],
				totalMerits: 0
			})
		).toEqual({
			newUserNickname: 'RSV | Callsign'
		});
	});

	it('throws when the computed nickname exceeds Discord limits', () => {
		expect(() =>
			buildUserNickname({
				isGuildOwner: false,
				baseNickname: 'X'.repeat(40),
				divisions: [
					{
						id: 1,
						code: 'SUP',
						name: 'Support',
						displayNamePrefix: 'SUPPORT-LONG',
						kind: DivisionKind.SUPPORT,
						showRank: false,
						discordRoleId: '1'
					}
				],
				totalMerits: 0
			})
		).toThrow();
	});
});

describe('stripTrailingMeritRankSuffix', () => {
	it.each([1, 20, 21, 35, 36, 37, 50])('strips the legacy level %i symbol', (level) => {
		expect(stripTrailingMeritRankSuffix(`Callsign ${getMeritRankSymbol(level)}`)).toBe('Callsign');
	});

	it('leaves a name without a legacy symbol unchanged', () => {
		expect(stripTrailingMeritRankSuffix('Callsign 51')).toBe('Callsign 51');
	});
});
