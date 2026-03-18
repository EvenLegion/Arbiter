import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	parseDiscordUserIdInput: vi.fn(),
	transformBulkNicknames: vi.fn(),
	createBulkNicknameTransformDeps: vi.fn(),
	buildBulkNicknameTransformPayload: vi.fn(),
	prepareDevGuildCommand: vi.fn()
}));

vi.mock('../../../../../src/lib/discord/members/memberDirectory', () => ({
	parseDiscordUserIdInput: mocks.parseDiscordUserIdInput
}));

vi.mock('../../../../../src/lib/services/bulk-nickname/bulkNicknameService', () => ({
	transformBulkNicknames: mocks.transformBulkNicknames
}));

vi.mock('../../../../../src/lib/services/bulk-nickname/createBulkNicknameTransformDeps', () => ({
	createBulkNicknameTransformDeps: mocks.createBulkNicknameTransformDeps
}));

vi.mock('../../../../../src/lib/features/dev/presenters/buildBulkNicknameTransformPayload', () => ({
	buildBulkNicknameTransformPayload: mocks.buildBulkNicknameTransformPayload
}));

vi.mock('../../../../../src/lib/features/dev/handlers/prepareDevGuildCommand', () => ({
	prepareDevGuildCommand: mocks.prepareDevGuildCommand
}));

import { handleDevNicknameTransform } from '../../../../../src/lib/features/dev/handlers/handleDevNicknameTransform';

describe('handleDevNicknameTransform', () => {
	beforeEach(() => {
		mocks.parseDiscordUserIdInput.mockReset();
		mocks.transformBulkNicknames.mockReset();
		mocks.createBulkNicknameTransformDeps.mockReset();
		mocks.buildBulkNicknameTransformPayload.mockReset();
		mocks.prepareDevGuildCommand.mockReset();
	});

	it('rejects invalid user input before running the transform', async () => {
		const prepared = createPrepared();
		mocks.prepareDevGuildCommand.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue(null);
		const interaction = createInteraction('not-a-user');

		await handleDevNicknameTransform({
			interaction,
			context: {
				requestId: 'req-1'
			} as never,
			mode: 'remove-prefix'
		});

		expect(mocks.transformBulkNicknames).not.toHaveBeenCalled();
		expect(prepared.responder.safeEditReply).toHaveBeenNthCalledWith(1, {
			content: 'Nickname remove-prefix started. requestId=`req-1`'
		});
		expect(prepared.responder.safeEditReply).toHaveBeenNthCalledWith(2, {
			content: 'Invalid `user` value. Select a user from autocomplete. requestId=`req-1`'
		});
	});

	it('runs the transform and replies with the built payload', async () => {
		const prepared = createPrepared();
		mocks.prepareDevGuildCommand.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue('discord-user-1');
		mocks.createBulkNicknameTransformDeps.mockReturnValue({
			deps: true
		});
		mocks.transformBulkNicknames.mockResolvedValue({
			kind: 'completed',
			scope: 'single',
			mode: 'reset',
			targetCount: 1,
			updated: 1,
			unchanged: 0,
			missingInGuild: 0,
			failed: 0,
			failures: []
		});
		mocks.buildBulkNicknameTransformPayload.mockReturnValue({
			content: 'done'
		});

		await handleDevNicknameTransform({
			interaction: createInteraction('discord-user-1'),
			context: {
				requestId: 'req-2'
			} as never,
			mode: 'reset'
		});

		expect(mocks.createBulkNicknameTransformDeps).toHaveBeenCalledWith({
			guild: prepared.guild
		});
		expect(mocks.transformBulkNicknames).toHaveBeenCalledWith(
			{
				deps: true
			},
			{
				requestedDiscordUserId: 'discord-user-1',
				mode: 'reset'
			}
		);
		expect(prepared.logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 'completed',
				mode: 'reset'
			}),
			'nickname.transform.completed'
		);
		expect(prepared.responder.safeEditReply).toHaveBeenLastCalledWith({
			content: 'done'
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

function createInteraction(user: string | null) {
	return {
		options: {
			getString: vi.fn(() => user)
		}
	} as never;
}
