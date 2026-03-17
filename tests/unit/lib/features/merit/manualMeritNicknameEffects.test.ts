import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createGuildNicknameWorkflowGateway: vi.fn(),
	notifyMeritRankUp: vi.fn()
}));

vi.mock('../../../../../src/lib/features/guild-member/guildNicknameWorkflowGateway', () => ({
	createGuildNicknameWorkflowGateway: mocks.createGuildNicknameWorkflowGateway
}));

vi.mock('../../../../../src/lib/features/merit/notifyMeritRankUp', () => ({
	notifyMeritRankUp: mocks.notifyMeritRankUp
}));

import { createManualMeritNicknameEffects } from '../../../../../src/lib/features/merit/manual-award/manualMeritNicknameEffects';

describe('manualMeritNicknameEffects', () => {
	beforeEach(() => {
		mocks.createGuildNicknameWorkflowGateway.mockReset();
		mocks.notifyMeritRankUp.mockReset();
	});

	it('maps nickname sync outcomes into workflow-friendly result kinds', async () => {
		mocks.createGuildNicknameWorkflowGateway.mockReturnValue({
			syncNickname: vi.fn().mockResolvedValue({
				kind: 'nickname-too-long'
			}),
			computeNickname: vi.fn()
		});

		const effects = createManualMeritNicknameEffects({
			guild: {
				id: 'guild-1'
			} as never,
			context: {} as never,
			logger: {
				warn: vi.fn()
			} as never,
			resolveMember: vi.fn()
		});

		await expect(
			effects.syncRecipientNickname({
				discordUserId: '42'
			})
		).resolves.toBe('nickname-too-long');
	});

	it('returns null and logs when awarder nickname computation cannot resolve a member', async () => {
		const warn = vi.fn();
		mocks.createGuildNicknameWorkflowGateway.mockReturnValue({
			syncNickname: vi.fn(),
			computeNickname: vi.fn().mockResolvedValue({
				kind: 'member-not-found'
			})
		});

		const effects = createManualMeritNicknameEffects({
			guild: {
				id: 'guild-1'
			} as never,
			context: {} as never,
			logger: {
				warn
			} as never,
			resolveMember: vi.fn()
		});

		await expect(
			effects.computeAwarderNickname({
				discordUserId: '42'
			})
		).resolves.toBeNull();
		expect(warn).toHaveBeenCalled();
	});

	it('loads the member before sending rank-up notifications', async () => {
		mocks.createGuildNicknameWorkflowGateway.mockReturnValue({
			syncNickname: vi.fn(),
			computeNickname: vi.fn()
		});
		const resolveMember = vi.fn().mockResolvedValue({
			id: '42'
		});

		const effects = createManualMeritNicknameEffects({
			guild: {
				id: 'guild-1'
			} as never,
			context: {} as never,
			logger: {
				warn: vi.fn()
			} as never,
			resolveMember
		});

		await effects.notifyRankUp({
			discordUserId: '42',
			previousTotalMerits: 4,
			currentTotalMerits: 6
		});

		expect(resolveMember).toHaveBeenCalledWith('42');
		expect(mocks.notifyMeritRankUp).toHaveBeenCalledWith({
			member: {
				id: '42'
			},
			previousTotalMerits: 4,
			currentTotalMerits: 6,
			logger: expect.objectContaining({
				warn: expect.any(Function)
			})
		});
	});
});
