import { describe, expect, it } from 'vitest';

import { buildGuildMemberSyncPayload } from '../../../../../src/lib/features/dev/presenters/buildGuildMemberSyncPayload';

describe('buildGuildMemberSyncPayload', () => {
	it('builds the sync summary embed', () => {
		const payload = buildGuildMemberSyncPayload({
			result: {
				kind: 'completed',
				totalMembers: 4,
				botMembersSkipped: 1,
				usersUpserted: 3,
				membershipSyncSucceeded: 3,
				nicknameComputed: 3,
				nicknameUpdated: 2,
				nicknameUnchanged: 1,
				badgeUpdated: 0,
				badgeFailed: 0,
				failedMembers: []
			}
		});

		expect(payload.embeds).toHaveLength(1);
		expect(payload.embeds[0].data.title).toBe('Guild Member Sync Complete');
		expect(payload.embeds[0].data.fields?.find((field) => field.name === 'Total Members')?.value).toBe('4');
		expect(payload.embeds[0].data.fields?.find((field) => field.name === 'Badges Updated')?.value).toBe('0');
		expect(payload.embeds[0].data.color).toBe(0x22c55e);
	});

	it('shows badge failures and the warning color', () => {
		const payload = buildGuildMemberSyncPayload({
			result: {
				kind: 'completed',
				totalMembers: 3,
				botMembersSkipped: 0,
				usersUpserted: 3,
				membershipSyncSucceeded: 3,
				nicknameComputed: 3,
				nicknameUpdated: 0,
				nicknameUnchanged: 3,
				badgeUpdated: 1,
				badgeFailed: 2,
				failedMembers: []
			}
		});

		expect(payload.embeds[0].data.fields?.find((field) => field.name === 'Badge Failures')?.value).toBe('2');
		expect(payload.embeds[0].data.color).toBe(0xf59e0b);
	});

	it('includes a failure preview when members fail to sync', () => {
		const payload = buildGuildMemberSyncPayload({
			result: {
				kind: 'completed',
				totalMembers: 2,
				botMembersSkipped: 0,
				usersUpserted: 2,
				membershipSyncSucceeded: 1,
				nicknameComputed: 1,
				nicknameUpdated: 1,
				nicknameUnchanged: 0,
				badgeUpdated: 0,
				badgeFailed: 0,
				failedMembers: [
					{
						discordUserId: 'discord-user-1',
						discordUsername: 'Pilot',
						discordNickname: 'Pilot',
						dbUserId: 'db-user-1',
						reason: 'Membership sync failed'
					}
				]
			}
		});

		expect(payload.embeds[0].data.fields?.find((field) => field.name === 'Failure Preview')?.value).toContain('Pilot');
	});
});
