import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	prepareGuildInteraction: vi.fn(),
	parseDiscordUserIdInput: vi.fn(),
	getGuildMember: vi.fn(),
	createGuildNicknameWorkflow: vi.fn(),
	userRepository: {
		get: vi.fn(),
		updateNickname: vi.fn()
	},
	divisionRepository: {
		listDivisions: vi.fn(),
		addMemberships: vi.fn()
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
	userRepository: mocks.userRepository,
	divisionRepository: mocks.divisionRepository
}));

import { handleStaffOrgAccept } from '../../../../../../src/lib/features/staff/org-accept/handleStaffOrgAccept';

describe('handleStaffOrgAccept', () => {
	beforeEach(() => {
		mocks.prepareGuildInteraction.mockReset();
		mocks.parseDiscordUserIdInput.mockReset();
		mocks.getGuildMember.mockReset();
		mocks.createGuildNicknameWorkflow.mockReset();
		mocks.userRepository.get.mockReset();
		mocks.userRepository.updateNickname.mockReset();
		mocks.divisionRepository.listDivisions.mockReset();
		mocks.divisionRepository.addMemberships.mockReset();
	});

	it('rejects mismatched user_id and user_name values', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockImplementation((value: string | null) => {
			if (value === '111111111111111111') {
				return '111111111111111111';
			}
			if (value === '222222222222222222') {
				return '222222222222222222';
			}
			return undefined;
		});

		await handleStaffOrgAccept({
			interaction: createInteraction({
				user_id: '111111111111111111',
				user_name: '222222222222222222',
				star_citizen_username: 'CitizenOne'
			}),
			context: createContext('req-1') as never
		});

		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: 'Provided `user_id` and `user_name` values mismatched. Provide matching values or only one. requestId=`req-1`'
		});
		expect(mocks.userRepository.get).not.toHaveBeenCalled();
	});

	it('adds INT, updates the stored nickname, and syncs the Discord nickname', async () => {
		const prepared = createPrepared();
		const member = createGuildMember({ hasIntRole: false });
		const syncNickname = vi.fn().mockResolvedValue({
			kind: 'synced',
			outcome: 'updated',
			member,
			computedNickname: 'INT | CitizenOne'
		});

		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockImplementation((value: string | null) => (value ? '123456789012345678' : undefined));
		mocks.userRepository.get.mockResolvedValue({
			id: 'db-user-1',
			discordUserId: '123456789012345678'
		});
		mocks.divisionRepository.listDivisions.mockResolvedValue([
			{
				id: 10,
				code: 'INT',
				name: 'Initiate'
			}
		]);
		mocks.getGuildMember.mockResolvedValue(member);
		mocks.userRepository.updateNickname.mockResolvedValue(undefined);
		mocks.divisionRepository.addMemberships.mockResolvedValue({
			count: 1
		});
		mocks.createGuildNicknameWorkflow.mockReturnValue({
			syncNickname
		});

		await handleStaffOrgAccept({
			interaction: createInteraction({
				user_id: null,
				user_name: '123456789012345678',
				star_citizen_username: 'CitizenOne'
			}),
			context: createContext('req-2') as never
		});

		expect(member.roles.add).toHaveBeenCalledWith('int-role-id', 'Accepted into the org via /staff org_accept');
		expect(mocks.userRepository.updateNickname).toHaveBeenCalledWith({
			discordUserId: '123456789012345678',
			discordNickname: 'CitizenOne'
		});
		expect(mocks.divisionRepository.addMemberships).toHaveBeenCalledWith({
			userId: 'db-user-1',
			divisionIds: [10]
		});
		expect(syncNickname).toHaveBeenCalledWith({
			discordUserId: '123456789012345678',
			setReason: 'Staff org accept nickname sync'
		});
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content:
				'Accepted <@123456789012345678> into the org, stored `CitizenOne` as their base nickname, and synced their Discord nickname. requestId=`req-2`'
		});
	});

	it('reports when nickname sync does not complete after applying INT', async () => {
		const prepared = createPrepared();
		const member = createGuildMember({ hasIntRole: true });
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue('123456789012345678');
		mocks.userRepository.get.mockResolvedValue({
			id: 'db-user-1',
			discordUserId: '123456789012345678'
		});
		mocks.divisionRepository.listDivisions.mockResolvedValue([
			{
				id: 10,
				code: 'INT',
				name: 'Initiate'
			}
		]);
		mocks.getGuildMember.mockResolvedValue(member);
		mocks.userRepository.updateNickname.mockResolvedValue(undefined);
		mocks.divisionRepository.addMemberships.mockResolvedValue({
			count: 0
		});
		mocks.createGuildNicknameWorkflow.mockReturnValue({
			syncNickname: vi.fn().mockResolvedValue({
				kind: 'member-not-found'
			})
		});

		await handleStaffOrgAccept({
			interaction: createInteraction({
				user_id: '123456789012345678',
				user_name: null,
				star_citizen_username: 'CitizenOne'
			}),
			context: createContext('req-3') as never
		});

		expect(member.roles.add).not.toHaveBeenCalled();
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content:
				'Applied INT and updated the stored nickname for <@123456789012345678>, but nickname sync did not complete (`member-not-found`). requestId=`req-3`'
		});
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

function createGuildMember({ hasIntRole }: { hasIntRole: boolean }) {
	return {
		id: '123456789012345678',
		roles: {
			cache: {
				has: vi.fn((roleId: string) => hasIntRole && roleId === 'int-role-id')
			},
			add: vi.fn().mockResolvedValue(undefined)
		}
	};
}

function createInteraction(values: { user_id: string | null; user_name: string | null; star_citizen_username: string }) {
	return {
		options: {
			getString: vi.fn((name: string, required?: boolean) => {
				if (name === 'user_id') {
					return values.user_id;
				}
				if (name === 'user_name') {
					return values.user_name;
				}
				if (name === 'star_citizen_username') {
					return values.star_citizen_username;
				}
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
