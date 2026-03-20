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
				failedMembers: []
			}
		});

		expect(payload.embeds).toHaveLength(1);
		expect(payload.embeds[0].data.title).toBe('Guild Member Sync Complete');
		expect(payload.embeds[0].data.fields?.find((field) => field.name === 'Total Members')?.value).toBe('4');
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
