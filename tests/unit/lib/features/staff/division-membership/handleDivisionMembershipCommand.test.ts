import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	prepareGuildInteraction: vi.fn(),
	parseDiscordUserIdInput: vi.fn(),
	applyDivisionMembershipMutation: vi.fn(),
	createDivisionMembershipMutationRuntime: vi.fn(),
	buildDivisionMembershipMutationReply: vi.fn()
}));

vi.mock('../../../../../../src/lib/discord/interactions/prepareGuildInteraction', () => ({
	prepareGuildInteraction: mocks.prepareGuildInteraction
}));

vi.mock('../../../../../../src/lib/discord/members/memberDirectory', () => ({
	parseDiscordUserIdInput: mocks.parseDiscordUserIdInput
}));

vi.mock('../../../../../../src/lib/services/division-membership/divisionMembershipService', () => ({
	applyDivisionMembershipMutation: mocks.applyDivisionMembershipMutation
}));

vi.mock('../../../../../../src/lib/features/staff/division-membership/divisionMembershipMutationRuntime', () => ({
	createDivisionMembershipMutationRuntime: mocks.createDivisionMembershipMutationRuntime
}));

vi.mock('../../../../../../src/lib/features/staff/division-membership/buildDivisionMembershipMutationReply', () => ({
	buildDivisionMembershipMutationReply: mocks.buildDivisionMembershipMutationReply
}));

import { handleDivisionMembershipCommand } from '../../../../../../src/lib/features/staff/division-membership/handleDivisionMembershipCommand';

describe('handleDivisionMembershipCommand', () => {
	beforeEach(() => {
		mocks.prepareGuildInteraction.mockReset();
		mocks.parseDiscordUserIdInput.mockReset();
		mocks.applyDivisionMembershipMutation.mockReset();
		mocks.createDivisionMembershipMutationRuntime.mockReset();
		mocks.buildDivisionMembershipMutationReply.mockReset();
	});

	it('rejects invalid nickname input before invoking the service', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue(null);

		await handleDivisionMembershipCommand({
			interaction: createInteraction(),
			context: {
				requestId: 'req-1'
			} as never,
			mode: 'add'
		});

		expect(mocks.applyDivisionMembershipMutation).not.toHaveBeenCalled();
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: 'Invalid `nickname` value. Select a user from autocomplete. requestId=`req-1`'
		});
	});

	it('runs the mutation runtime and replies with the built success copy', async () => {
		const prepared = createPrepared();
		const context = {
			requestId: 'req-2'
		};
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue('discord-user-1');
		mocks.createDivisionMembershipMutationRuntime.mockReturnValue({
			runtime: true
		});
		mocks.applyDivisionMembershipMutation.mockResolvedValue({
			kind: 'updated',
			mode: 'add',
			divisionName: 'Navy',
			targetDiscordUserId: 'discord-user-1',
			nicknameSync: {
				kind: 'failed',
				errorMessage: 'sync failed'
			}
		});
		mocks.buildDivisionMembershipMutationReply.mockReturnValue('done');

		await handleDivisionMembershipCommand({
			interaction: createInteraction(),
			context: context as never,
			mode: 'add'
		});

		expect(mocks.applyDivisionMembershipMutation).toHaveBeenCalledWith(
			{
				runtime: true
			},
			{
				mode: 'add',
				targetDiscordUserId: 'discord-user-1',
				divisionSelection: 'Navy',
				syncNickname: true
			}
		);
		expect(prepared.logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 'updated',
				mode: 'add'
			}),
			'division.membership.updated_with_nickname_sync_issue'
		);
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
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

function createInteraction() {
	return {
		options: {
			getString: vi.fn((name: string) => {
				if (name === 'nickname') {
					return 'discord-user-1';
				}
				if (name === 'division_name') {
					return 'Navy';
				}
				return null;
			}),
			getBoolean: vi.fn(() => undefined)
		}
	} as never;
}
