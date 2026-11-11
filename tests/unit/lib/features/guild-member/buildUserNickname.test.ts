import { DivisionKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { DISCORD_MAX_NICKNAME_LENGTH } from '../../../../../src/lib/constants';
import { getMeritRankSymbol } from '../../../../../src/lib/services/merit-rank/meritRank';
import { buildUserNickname, stripTrailingMeritRankSuffix } from '../../../../../src/lib/services/nickname/buildUserNickname';

describe('buildUserNickname', () => {
	const legionnaire = {
		id: 3,
		code: 'LGN',
		name: 'Legionnaire',
		displayNamePrefix: 'LGN',
		kind: DivisionKind.LEGIONNAIRE,
		showRank: true,
		discordRoleId: '3'
	};

	it('skips nickname computation for the guild owner', () => {
		expect(
			buildUserNickname({
				isGuildOwner: true,
				baseNickname: 'OwnerName',
				divisions: []
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
				]
			})
		).toEqual({
			newUserNickname: 'RSV | Callsign'
		});
	});

	it('never appends a merit rank symbol, even for a showRank division', () => {
		expect(
			buildUserNickname({
				isGuildOwner: false,
				baseNickname: 'Callsign',
				divisions: [legionnaire]
			})
		).toEqual({
			newUserNickname: 'LGN | Callsign'
		});
	});

	it('strips a legacy rank symbol left in the base nickname', () => {
		expect(
			buildUserNickname({
				isGuildOwner: false,
				baseNickname: `Callsign ${getMeritRankSymbol(42)}`,
				divisions: []
			})
		).toEqual({
			newUserNickname: 'Callsign'
		});
	});

	it('accepts a nickname at exactly the Discord limit', () => {
		const baseNickname = 'X'.repeat(DISCORD_MAX_NICKNAME_LENGTH - 'LGN | '.length);

		expect(
			buildUserNickname({
				isGuildOwner: false,
				baseNickname,
				divisions: [legionnaire]
			})
		).toEqual({
			newUserNickname: `LGN | ${baseNickname}`
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
				]
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
