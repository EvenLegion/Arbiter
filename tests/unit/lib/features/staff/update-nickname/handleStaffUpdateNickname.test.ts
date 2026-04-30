import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DISCORD_MAX_NICKNAME_LENGTH } from '../../../../../../src/lib/constants';

const mocks = vi.hoisted(() => ({
	prepareGuildInteraction: vi.fn(),
	parseDiscordUserIdInput: vi.fn(),
	getGuildMember: vi.fn(),
	createGuildNicknameWorkflow: vi.fn(),
	userRepository: {
		get: vi.fn(),
		updateNickname: vi.fn()
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
	userRepository: mocks.userRepository
}));

import { handleStaffUpdateNickname } from '../../../../../../src/lib/features/staff/update-nickname/handleStaffUpdateNickname';

describe('handleStaffUpdateNickname', () => {
	beforeEach(() => {
		mocks.prepareGuildInteraction.mockReset();
		mocks.parseDiscordUserIdInput.mockReset();
		mocks.getGuildMember.mockReset();
		mocks.createGuildNicknameWorkflow.mockReset();
		mocks.userRepository.get.mockReset();
		mocks.userRepository.updateNickname.mockReset();
	});

	it('rejects invalid existing_user input', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue(undefined);

		await handleStaffUpdateNickname({
			interaction: createInteraction({
				existing_user: 'not-a-user',
				new_nickname: 'CitizenOne'
			}),
			context: createContext('req-1') as never
		});

		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: 'Invalid `existing_user` value. Select a user from autocomplete. requestId=`req-1`'
		});
	});

	it('rejects an empty new nickname before touching the db', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue('123456789012345678');

		await handleStaffUpdateNickname({
			interaction: createInteraction({
				existing_user: '123456789012345678',
				new_nickname: '   '
			}),
			context: createContext('req-empty') as never
		});

		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: '`new_nickname` must not be empty. requestId=`req-empty`'
		});
		expect(mocks.userRepository.get).not.toHaveBeenCalled();
	});

	it('rejects an overlong new nickname before touching the db', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue('123456789012345678');

		await handleStaffUpdateNickname({
			interaction: createInteraction({
				existing_user: '123456789012345678',
				new_nickname: 'x'.repeat(DISCORD_MAX_NICKNAME_LENGTH + 1)
			}),
			context: createContext('req-long') as never
		});

		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: `\`new_nickname\` must be ${DISCORD_MAX_NICKNAME_LENGTH} characters or fewer. requestId=\`req-long\``
		});
		expect(mocks.userRepository.get).not.toHaveBeenCalled();
	});

	it('updates the stored nickname and syncs the Discord nickname', async () => {
		const prepared = createPrepared();
		const member = createGuildMember();
		const syncNickname = vi.fn().mockResolvedValue({
			kind: 'synced',
			outcome: 'updated',
			member,
			computedNickname: 'RES | CitizenOne'
		});

		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue('123456789012345678');
		mocks.userRepository.get.mockResolvedValue({
			id: 'db-user-1',
			discordUserId: '123456789012345678'
		});
		mocks.getGuildMember.mockResolvedValue(member);
		mocks.userRepository.updateNickname.mockResolvedValue(undefined);
		mocks.createGuildNicknameWorkflow.mockReturnValue({
			syncNickname
		});

		await handleStaffUpdateNickname({
			interaction: createInteraction({
				existing_user: '123456789012345678',
				new_nickname: 'CitizenOne'
			}),
			context: createContext('req-2') as never
		});

		expect(mocks.userRepository.updateNickname).toHaveBeenCalledWith({
			discordUserId: '123456789012345678',
			discordNickname: 'CitizenOne'
		});
		expect(syncNickname).toHaveBeenCalledWith({
			discordUserId: '123456789012345678',
			setReason: 'Staff nickname update sync'
		});
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: 'Updated the stored nickname for <@123456789012345678> to `CitizenOne` and synced their Discord nickname. requestId=`req-2`'
		});
	});

	it('reports when nickname sync does not complete after updating the stored nickname', async () => {
		const prepared = createPrepared();
		const member = createGuildMember();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue('123456789012345678');
		mocks.userRepository.get.mockResolvedValue({
			id: 'db-user-1',
			discordUserId: '123456789012345678'
		});
		mocks.getGuildMember.mockResolvedValue(member);
		mocks.userRepository.updateNickname.mockResolvedValue(undefined);
		mocks.createGuildNicknameWorkflow.mockReturnValue({
			syncNickname: vi.fn().mockResolvedValue({
				kind: 'nickname-too-long'
			})
		});

		await handleStaffUpdateNickname({
			interaction: createInteraction({
				existing_user: '123456789012345678',
				new_nickname: 'CitizenOne'
			}),
			context: createContext('req-3') as never
		});

		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content:
				'Updated the stored nickname for <@123456789012345678> to `CitizenOne`, but nickname sync did not complete (`nickname-too-long`). requestId=`req-3`'
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

function createGuildMember() {
	return {
		id: '123456789012345678'
	};
}

function createInteraction(values: { existing_user: string; new_nickname: string }) {
	return {
		options: {
			getString: vi.fn((name: string, required?: boolean) => {
				if (name === 'existing_user') {
					return values.existing_user;
				}
				if (name === 'new_nickname') {
					return values.new_nickname;
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
