import { describe, expect, it, vi } from 'vitest';

import { resolveActorCoreWithDeps } from '../../../../src/lib/discord/actor/actorResolver';

describe('actorCapabilityResolver', () => {
	it('returns guild_not_found when the configured guild lookup fails', async () => {
		const result = await resolveActorCoreWithDeps(
			{
				getConfiguredGuild: async () => {
					throw new Error('missing guild');
				},
				getMember: vi.fn(),
				hasDivisionKindRole: vi.fn(),
				hasDivision: vi.fn(),
				centurionRoleId: 'centurion-role'
			},
			{
				discordUserId: '42'
			}
		);

		expect(result).toEqual({
			kind: 'guild_not_found',
			error: expect.any(Error)
		});
	});

	it('returns insufficient_capability when the requester is not staff', async () => {
		const guild = {
			id: 'guild-1'
		} as never;
		const member = {
			id: 'member-1'
		} as never;

		const result = await resolveActorCoreWithDeps(
			{
				getMember: async () => member,
				hasDivisionKindRole: async () => false,
				hasDivision: async () => false,
				centurionRoleId: 'centurion-role'
			},
			{
				guild,
				discordUserId: '42',
				capabilityRequirement: 'staff'
			}
		);

		expect(result).toEqual({
			kind: 'insufficient_capability',
			guild,
			member,
			capabilities: {
				isStaff: false,
				isCenturion: false
			}
		});
	});

	it('returns db_user_not_found when db user enrichment is required but missing', async () => {
		const guild = {
			id: 'guild-1'
		} as never;
		const member = {
			id: 'member-1'
		} as never;

		const result = await resolveActorCoreWithDeps(
			{
				getMember: async () => member,
				hasDivisionKindRole: async () => true,
				hasDivision: async () => false,
				getDbUser: async () => {
					throw new Error('missing db user');
				},
				centurionRoleId: 'centurion-role'
			},
			{
				guild,
				discordUserId: '42',
				capabilityRequirement: 'staff',
				resolveDbUser: true
			}
		);

		expect(result).toEqual({
			kind: 'db_user_not_found',
			guild,
			member,
			capabilities: {
				isStaff: true,
				isCenturion: false
			},
			error: expect.any(Error)
		});
	});

	it('returns the resolved member, capabilities, and db user on success', async () => {
		const guild = {
			id: 'guild-1'
		} as never;
		const member = {
			id: 'member-1'
		} as never;

		const result = await resolveActorCoreWithDeps(
			{
				getMember: async () => member,
				hasDivisionKindRole: async () => true,
				hasDivision: async () => true,
				getDbUser: async () => ({
					id: 'db-user-1'
				}),
				centurionRoleId: 'centurion-role'
			},
			{
				guild,
				discordUserId: '42',
				capabilityRequirement: 'staff-or-centurion',
				resolveDbUser: true
			}
		);

		expect(result).toEqual({
			kind: 'ok',
			guild,
			member,
			capabilities: {
				isStaff: true,
				isCenturion: true
			},
			dbUser: {
				id: 'db-user-1'
			}
		});
	});
});
