import { DivisionKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { buildUserNickname } from '../../../../../src/lib/services/nickname/buildUserNickname';

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
