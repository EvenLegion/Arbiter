import { Collection } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockExecutionContext, createMockLogger } from '../../../../support/logger';

const mocks = vi.hoisted(() => ({
	createGuildMemberChangeDeps: vi.fn(),
	processGuildMemberRoleChange: vi.fn(),
	listCachedDivisions: vi.fn()
}));

vi.mock('../../../../../src/lib/features/guild-member/membership/createGuildMemberChangeDeps', () => ({
	createGuildMemberChangeDeps: mocks.createGuildMemberChangeDeps
}));

vi.mock('../../../../../src/lib/services/guild-member-change/guildMemberChangeService', () => ({
	processGuildMemberRoleChange: mocks.processGuildMemberRoleChange
}));

vi.mock('../../../../../src/lib/discord/guild/divisions', () => ({
	listCachedDivisions: mocks.listCachedDivisions
}));

import { handleGuildMemberUpdate } from '../../../../../src/lib/features/guild-member/handlers/handleGuildMemberUpdate';

describe('handleGuildMemberUpdate', () => {
	beforeEach(() => {
		mocks.createGuildMemberChangeDeps.mockReset();
		mocks.processGuildMemberRoleChange.mockReset();
		mocks.listCachedDivisions.mockReset();
	});

	it('routes partial old-member payloads through the service without division lookups', async () => {
		mocks.createGuildMemberChangeDeps.mockReturnValue({
			id: 'deps'
		});
		mocks.processGuildMemberRoleChange.mockResolvedValue({
			kind: 'skipped_no_role_change',
			discordUserId: '42',
			roleDiff: {
				oldMemberIsPartial: true,
				haveRolesChanged: false,
				oldRoleIds: [],
				newRoleIds: ['role-1'],
				addedRoleIds: ['role-1'],
				removedRoleIds: []
			}
		});
		const logger = createMockLogger();
		const context = createMockExecutionContext({
			logger
		});
		const newMember = createGuildMember({
			discordUserId: '42',
			discordUsername: 'new-user',
			nickname: 'New User',
			roleIds: ['role-1']
		});

		await handleGuildMemberUpdate({
			oldMember: createPartialGuildMember(),
			newMember,
			context
		});

		expect(mocks.createGuildMemberChangeDeps).toHaveBeenCalledWith({
			guild: newMember.guild,
			context
		});
		expect(mocks.processGuildMemberRoleChange).toHaveBeenCalledWith(
			{
				id: 'deps'
			},
			{
				discordUserId: '42',
				oldMemberIsPartial: true,
				oldRoleIds: [],
				newRoleIds: ['role-1']
			}
		);
		expect(mocks.listCachedDivisions).not.toHaveBeenCalled();
		expect(logger.trace).toHaveBeenCalled();
	});

	it('logs processed membership changes with the service result', async () => {
		mocks.createGuildMemberChangeDeps.mockReturnValue({
			id: 'deps'
		});
		mocks.processGuildMemberRoleChange.mockResolvedValue({
			kind: 'processed',
			discordUserId: '42',
			roleDiff: {
				oldMemberIsPartial: false,
				haveRolesChanged: true,
				oldRoleIds: ['role-old'],
				newRoleIds: ['role-new'],
				addedRoleIds: ['role-new'],
				removedRoleIds: ['role-old']
			},
			membership: {
				addedDivisions: [
					{
						id: 1,
						name: 'Navy',
						discordRoleId: 'role-new'
					}
				],
				removedDivisions: []
			},
			nickname: {
				kind: 'updated',
				computedNickname: 'Member | Navy'
			}
		});
		mocks.listCachedDivisions.mockResolvedValue([
			{
				id: 1,
				name: 'Old Division',
				discordRoleId: 'role-old'
			},
			{
				id: 2,
				name: 'New Division',
				discordRoleId: 'role-new'
			}
		]);
		const logger = createMockLogger();
		const context = createMockExecutionContext({
			logger
		});

		await handleGuildMemberUpdate({
			oldMember: createGuildMember({
				discordUserId: '42',
				discordUsername: 'old-user',
				nickname: 'Old User',
				roleIds: ['role-old']
			}),
			newMember: createGuildMember({
				discordUserId: '42',
				discordUsername: 'new-user',
				nickname: 'New User',
				roleIds: ['role-new']
			}),
			context
		});

		expect(mocks.listCachedDivisions).toHaveBeenCalledWith({});
		expect(logger.debug).toHaveBeenCalled();
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				discordUserId: '42',
				nickname: {
					kind: 'updated',
					computedNickname: 'Member | Navy'
				}
			}),
			'Processed guild member update workflow'
		);
	});

	it('logs missing-member failures from the workflow service', async () => {
		mocks.createGuildMemberChangeDeps.mockReturnValue({
			id: 'deps'
		});
		mocks.processGuildMemberRoleChange.mockResolvedValue({
			kind: 'member_not_found',
			discordUserId: '42',
			roleDiff: {
				oldMemberIsPartial: false,
				haveRolesChanged: true,
				oldRoleIds: ['role-old'],
				newRoleIds: ['role-new'],
				addedRoleIds: ['role-new'],
				removedRoleIds: ['role-old']
			}
		});
		mocks.listCachedDivisions.mockResolvedValue([]);
		const logger = createMockLogger();
		const context = createMockExecutionContext({
			logger
		});

		await handleGuildMemberUpdate({
			oldMember: createGuildMember({
				discordUserId: '42',
				discordUsername: 'old-user',
				nickname: 'Old User',
				roleIds: ['role-old']
			}),
			newMember: createGuildMember({
				discordUserId: '42',
				discordUsername: 'new-user',
				nickname: 'New User',
				roleIds: ['role-new']
			}),
			context
		});

		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				discordUserId: '42'
			}),
			'Discord user not found in guild members'
		);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it('logs nickname sync failures as errors instead of successful workflow completion', async () => {
		mocks.createGuildMemberChangeDeps.mockReturnValue({
			id: 'deps'
		});
		mocks.processGuildMemberRoleChange.mockResolvedValue({
			kind: 'processed',
			discordUserId: '42',
			roleDiff: {
				oldMemberIsPartial: false,
				haveRolesChanged: true,
				oldRoleIds: ['role-old'],
				newRoleIds: ['role-new'],
				addedRoleIds: ['role-new'],
				removedRoleIds: ['role-old']
			},
			membership: {
				addedDivisions: [],
				removedDivisions: []
			},
			nickname: {
				kind: 'sync_failed',
				reason: 'sync-failed',
				errorMessage: 'Missing permissions',
				errorName: 'DiscordAPIError'
			}
		});
		mocks.listCachedDivisions.mockResolvedValue([]);
		const logger = createMockLogger();
		const context = createMockExecutionContext({
			logger
		});

		await handleGuildMemberUpdate({
			oldMember: createGuildMember({
				discordUserId: '42',
				discordUsername: 'old-user',
				nickname: 'Old User',
				roleIds: ['role-old']
			}),
			newMember: createGuildMember({
				discordUserId: '42',
				discordUsername: 'new-user',
				nickname: 'New User',
				roleIds: ['role-new']
			}),
			context
		});

		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				discordUserId: '42',
				nickname: expect.objectContaining({
					kind: 'sync_failed',
					errorMessage: 'Missing permissions'
				})
			}),
			'Guild member update workflow failed during nickname sync'
		);
		expect(logger.info).not.toHaveBeenCalled();
	});
});

function createPartialGuildMember() {
	return {
		partial: true,
		roles: {
			cache: new Collection()
		}
	} as never;
}

function createGuildMember({
	discordUserId,
	discordUsername,
	nickname,
	roleIds
}: {
	discordUserId: string;
	discordUsername: string;
	nickname: string | null;
	roleIds: string[];
}) {
	return {
		partial: false,
		guild: {
			id: 'guild-1'
		},
		user: {
			id: discordUserId,
			username: discordUsername
		},
		nickname,
		roles: {
			cache: new Collection(roleIds.map((roleId) => [roleId, { id: roleId }]))
		}
	} as never;
}
