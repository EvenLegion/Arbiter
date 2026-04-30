import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	prepareGuildInteraction: vi.fn(),
	parseDiscordUserIdInput: vi.fn(),
	getGuildMember: vi.fn(),
	createGuildNicknameWorkflow: vi.fn(),
	userMigrationRepository: {
		migrateByDiscordUserId: vi.fn()
	}
}));

vi.mock('../../../../../../src/lib/discord/interactions/prepareGuildInteraction', () => ({
	prepareGuildInteraction: mocks.prepareGuildInteraction
}));

vi.mock('../../../../../../src/lib/discord/members/memberDirectory', () => ({
	parseDiscordUserIdInput: mocks.parseDiscordUserIdInput
}));

vi.mock('../../../../../../src/lib/discord/guild/guildMembers', () => ({
	getGuildMember: mocks.getGuildMember
}));

vi.mock('../../../../../../src/lib/services/nickname/guildNicknameWorkflow', () => ({
	createGuildNicknameWorkflow: mocks.createGuildNicknameWorkflow
}));

vi.mock('../../../../../../src/integrations/prisma/repositories', () => ({
	userMigrationRepository: mocks.userMigrationRepository
}));

import { handleStaffUserMigrate } from '../../../../../../src/lib/features/staff/user-migration/handleStaffUserMigrate';

describe('handleStaffUserMigrate', () => {
	beforeEach(() => {
		mocks.prepareGuildInteraction.mockReset();
		mocks.parseDiscordUserIdInput.mockReset();
		mocks.getGuildMember.mockReset();
		mocks.createGuildNicknameWorkflow.mockReset();
		mocks.userMigrationRepository.migrateByDiscordUserId.mockReset();
	});

	it('rejects invalid old_user_id input', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockImplementation((value: string | null) => (value === 'new-user' ? '200000000000000000' : undefined));

		await handleStaffUserMigrate({
			interaction: createInteraction({
				old_user_id: 'bad',
				new_user_id: 'new-user'
			}),
			context: createContext('req-1') as never
		});

		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: 'Invalid `old_user_id` value. Provide a Discord user ID or mention. requestId=`req-1`'
		});
	});

	it('reports when the old user is not in the user table', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockImplementation((value: string | null) => {
			if (value === 'old-user') return '100000000000000000';
			if (value === 'new-user') return '200000000000000000';
			return undefined;
		});
		mocks.userMigrationRepository.migrateByDiscordUserId.mockResolvedValue({
			kind: 'old_user_not_found'
		});

		await handleStaffUserMigrate({
			interaction: createInteraction({
				old_user_id: 'old-user',
				new_user_id: 'new-user'
			}),
			context: createContext('req-2') as never
		});

		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: 'Old user is not present in the User table. requestId=`req-2`'
		});
	});

	it('migrates records and syncs the new nickname when the new member is present', async () => {
		const prepared = createPrepared();
		const oldMember = createMember('100000000000000000', ['role-copy', 'guild-1']);
		const newMember = createMember('200000000000000000', ['existing-role', 'guild-1']);
		const syncNickname = vi.fn().mockResolvedValue({
			kind: 'synced',
			outcome: 'updated',
			member: newMember,
			computedNickname: 'INT | Callsign'
		});
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockImplementation((value: string | null) => {
			if (value === 'old-user') return '100000000000000000';
			if (value === 'new-user') return '200000000000000000';
			return undefined;
		});
		mocks.userMigrationRepository.migrateByDiscordUserId.mockResolvedValue({
			kind: 'migrated',
			oldUser: {
				dbUserId: 'old-db',
				discordUserId: '100000000000000000'
			},
			newUser: {
				dbUserId: 'new-db',
				discordUserId: '200000000000000000'
			},
			counts: {
				requestedNameChangesMigrated: 1,
				reviewedNameChangesMigrated: 2,
				meritsReceivedMigrated: 3,
				meritsAwardedMigrated: 4,
				hostedEventsMigrated: 5,
				finalizedEventsMigrated: 6,
				eventChannelsMigrated: 7,
				divisionMembershipsReassigned: 8,
				divisionMembershipsMerged: 9,
				participantStatsReassigned: 10,
				participantStatsMerged: 11,
				reviewDecisionsReassigned: 12,
				reviewDecisionsMerged: 13,
				baseNicknameCopied: true
			}
		});
		mocks.getGuildMember.mockImplementation(async ({ discordUserId }: { discordUserId: string }) => {
			if (discordUserId === '100000000000000000') return oldMember;
			if (discordUserId === '200000000000000000') return newMember;
			return null;
		});
		mocks.createGuildNicknameWorkflow.mockReturnValue({
			syncNickname
		});

		await handleStaffUserMigrate({
			interaction: createInteraction({
				old_user_id: 'old-user',
				new_user_id: 'new-user'
			}),
			context: createContext('req-3') as never
		});

		expect(syncNickname).toHaveBeenCalledWith({
			discordUserId: '200000000000000000',
			setReason: 'Staff user migration nickname sync'
		});
		expect(newMember.roles.add).toHaveBeenCalledWith(
			'role-copy',
			'Copied role from old account via /staff user_migrate (100000000000000000 -> 200000000000000000)'
		);
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: expect.stringContaining('Migrated records from <@100000000000000000> to <@200000000000000000>.')
		});
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: expect.stringContaining('Role copy: added 1 roles from the old user.')
		});
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: expect.stringContaining('Nickname sync: updated.')
		});
	});

	it('skips role copy when the old user is not present in the configured guild', async () => {
		const prepared = createPrepared();
		const newMember = createMember('200000000000000000', ['guild-1']);
		const syncNickname = vi.fn().mockResolvedValue({
			kind: 'synced',
			outcome: 'unchanged',
			member: newMember,
			computedNickname: 'INT | Callsign'
		});
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockImplementation((value: string | null) => {
			if (value === 'old-user') return '100000000000000000';
			if (value === 'new-user') return '200000000000000000';
			return undefined;
		});
		mocks.userMigrationRepository.migrateByDiscordUserId.mockResolvedValue({
			kind: 'migrated',
			oldUser: {
				dbUserId: 'old-db',
				discordUserId: '100000000000000000'
			},
			newUser: {
				dbUserId: 'new-db',
				discordUserId: '200000000000000000'
			},
			counts: {
				requestedNameChangesMigrated: 0,
				reviewedNameChangesMigrated: 0,
				meritsReceivedMigrated: 0,
				meritsAwardedMigrated: 0,
				hostedEventsMigrated: 0,
				finalizedEventsMigrated: 0,
				eventChannelsMigrated: 0,
				divisionMembershipsReassigned: 0,
				divisionMembershipsMerged: 0,
				participantStatsReassigned: 0,
				participantStatsMerged: 0,
				reviewDecisionsReassigned: 0,
				reviewDecisionsMerged: 0,
				baseNicknameCopied: false
			}
		});
		mocks.getGuildMember.mockImplementation(async ({ discordUserId }: { discordUserId: string }) => {
			if (discordUserId === '100000000000000000') return null;
			if (discordUserId === '200000000000000000') return newMember;
			return null;
		});
		mocks.createGuildNicknameWorkflow.mockReturnValue({
			syncNickname
		});

		await handleStaffUserMigrate({
			interaction: createInteraction({
				old_user_id: 'old-user',
				new_user_id: 'new-user'
			}),
			context: createContext('req-4') as never
		});

		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: expect.stringContaining('Role copy skipped because the old user is not present in the configured guild.')
		});
		expect(newMember.roles.add).not.toHaveBeenCalled();
	});
});

function createPrepared() {
	return {
		guild: {
			id: 'guild-1'
		},
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn()
		},
		responder: {
			safeEditReply: vi.fn().mockResolvedValue(undefined),
			fail: vi.fn().mockResolvedValue(undefined)
		}
	};
}

function createMember(id: string, roleIds: string[]) {
	return {
		id,
		roles: {
			cache: new Map(
				roleIds.map((roleId) => [
					roleId,
					{
						id: roleId,
						managed: false
					}
				])
			),
			add: vi.fn().mockResolvedValue(undefined)
		}
	};
}

function createInteraction(values: { old_user_id: string; new_user_id: string }) {
	return {
		options: {
			getString: vi.fn((name: string, required?: boolean) => {
				if (name === 'old_user_id') return values.old_user_id;
				if (name === 'new_user_id') return values.new_user_id;
				if (required) {
					throw new Error(`Unexpected required option: ${name}`);
				}
				return null;
			})
		}
	} as never;
}

function createContext(requestId: string) {
	return {
		requestId,
		logger: {
			child: vi.fn(() => ({
				trace: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn()
			}))
		}
	};
}
