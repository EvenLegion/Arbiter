import { describe, expect, it, vi } from 'vitest';

import { syncGuildMembers } from '../../../../../src/lib/services/guild-member-sync/guildMemberSyncService';

type TestGuildMember = {
	id: string;
	username: string;
	nickname: string;
	avatarUrl: string;
	isBot?: boolean;
};

describe('guildMemberSyncService', () => {
	it('summarizes successful syncs across bots, unchanged nicknames, and updates', async () => {
		const members: TestGuildMember[] = [
			{
				id: '4001',
				username: 'human-one',
				nickname: 'Human One',
				avatarUrl: 'https://example.com/4001.png'
			},
			{
				id: '4002',
				username: 'human-two',
				nickname: 'Human Two',
				avatarUrl: 'https://example.com/4002.png'
			},
			{
				id: '4999',
				username: 'bot-user',
				nickname: 'Bot User',
				avatarUrl: 'https://example.com/4999.png',
				isBot: true
			}
		];

		const result = await syncGuildMembers({
			refreshDivisionCache: vi.fn(async () => undefined),
			listMembers: async () => members,
			buildSnapshot: (member) => ({
				discordUserId: member.id,
				discordUsername: member.username,
				discordNickname: member.nickname,
				discordAvatarUrl: member.avatarUrl,
				isBot: member.isBot ?? false
			}),
			upsertUser: vi.fn(async ({ discordUserId }) => ({
				id: `db-${discordUserId}`
			})),
			reconcileMemberships: vi.fn(async () => undefined),
			syncNickname: vi.fn(async ({ member }) => ({
				outcome: member.id === '4001' ? 'updated' : 'unchanged'
			}))
		});

		expect(result).toEqual({
			kind: 'completed',
			totalMembers: 3,
			botMembersSkipped: 1,
			usersUpserted: 2,
			membershipSyncSucceeded: 2,
			nicknameComputed: 2,
			nicknameUpdated: 1,
			nicknameUnchanged: 1,
			failedMembers: []
		});
	});

	it('reports partial failures with db user context when later steps fail', async () => {
		const result = await syncGuildMembers({
			refreshDivisionCache: vi.fn(async () => undefined),
			listMembers: async () => [
				{
					id: '4101',
					username: 'upsert-fails',
					nickname: 'Upsert Fails',
					avatarUrl: 'https://example.com/4101.png'
				},
				{
					id: '4102',
					username: 'reconcile-fails',
					nickname: 'Reconcile Fails',
					avatarUrl: 'https://example.com/4102.png'
				},
				{
					id: '4103',
					username: 'nickname-fails',
					nickname: 'Nickname Fails',
					avatarUrl: 'https://example.com/4103.png'
				}
			],
			buildSnapshot: (member) => ({
				discordUserId: member.id,
				discordUsername: member.username,
				discordNickname: member.nickname,
				discordAvatarUrl: member.avatarUrl,
				isBot: false
			}),
			upsertUser: vi.fn(async ({ discordUserId }) => {
				if (discordUserId === '4101') {
					throw new Error('Upsert exploded');
				}

				return {
					id: `db-${discordUserId}`
				};
			}),
			reconcileMemberships: vi.fn(async ({ member }) => {
				if (member.id === '4102') {
					throw new Error('Membership reconcile failed');
				}
			}),
			syncNickname: vi.fn(async ({ member }) => {
				if (member.id === '4103') {
					throw new Error('Nickname sync failed');
				}

				return {
					outcome: 'updated' as const
				};
			})
		});

		expect(result).toEqual({
			kind: 'completed',
			totalMembers: 3,
			botMembersSkipped: 0,
			usersUpserted: 2,
			membershipSyncSucceeded: 1,
			nicknameComputed: 0,
			nicknameUpdated: 0,
			nicknameUnchanged: 0,
			failedMembers: [
				{
					discordUserId: '4101',
					discordUsername: 'upsert-fails',
					discordNickname: 'Upsert Fails',
					dbUserId: null,
					reason: 'Upsert exploded'
				},
				{
					discordUserId: '4102',
					discordUsername: 'reconcile-fails',
					discordNickname: 'Reconcile Fails',
					dbUserId: 'db-4102',
					reason: 'Membership reconcile failed'
				},
				{
					discordUserId: '4103',
					discordUsername: 'nickname-fails',
					discordNickname: 'Nickname Fails',
					dbUserId: 'db-4103',
					reason: 'Nickname sync failed'
				}
			]
		});
	});
});
