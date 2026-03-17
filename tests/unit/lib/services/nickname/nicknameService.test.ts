import { describe, expect, it, vi } from 'vitest';

import { NicknameTooLongError } from '../../../../../src/lib/errors/nicknameTooLongError';
import { computeNicknameForUser, syncNicknameForUser, validateRequestedNickname } from '../../../../../src/lib/services/nickname/nicknameService';

describe('nicknameService', () => {
	it('validates a requested nickname when the computed nickname fits', async () => {
		const member = {
			id: 'member-1'
		};

		await expect(
			validateRequestedNickname(
				{
					getMember: vi.fn().mockResolvedValue(member),
					computeNickname: vi.fn().mockResolvedValue({
						computedNickname: 'ARC NewName',
						reason: undefined
					})
				},
				{
					discordUserId: 'discord-user-1',
					requestedName: 'NewName'
				}
			)
		).resolves.toEqual({
			kind: 'valid'
		});
	});

	it('returns member-not-found when the target guild member is unavailable', async () => {
		await expect(
			validateRequestedNickname(
				{
					getMember: vi.fn().mockResolvedValue(null),
					computeNickname: vi.fn()
				},
				{
					discordUserId: 'missing-user',
					requestedName: 'NewName'
				}
			)
		).resolves.toEqual({
			kind: 'member-not-found'
		});
	});

	it('returns compute-failed when nickname computation throws unexpectedly', async () => {
		await expect(
			computeNicknameForUser(
				{
					getMember: vi.fn().mockResolvedValue({
						id: 'member-1'
					}),
					computeNickname: vi.fn().mockRejectedValue(new Error('boom'))
				},
				{
					discordUserId: 'discord-user-1'
				}
			)
		).resolves.toEqual(
			expect.objectContaining({
				kind: 'compute-failed',
				errorMessage: 'boom',
				errorName: 'Error'
			})
		);
	});

	it('returns a computed nickname for a known member', async () => {
		await expect(
			computeNicknameForUser(
				{
					getMember: vi.fn().mockResolvedValue({
						id: 'member-1'
					}),
					computeNickname: vi.fn().mockResolvedValue({
						computedNickname: 'ARC NewName',
						reason: undefined
					})
				},
				{
					discordUserId: 'discord-user-1'
				}
			)
		).resolves.toEqual({
			kind: 'computed',
			computedNickname: 'ARC NewName',
			reason: undefined
		});
	});

	it('surfaces nickname-too-long when nickname sync exceeds Discord limits', async () => {
		const nicknameTooLongError = new NicknameTooLongError({
			computedNickname: 'A Very Long Nickname',
			computedLength: 40
		});

		await expect(
			syncNicknameForUser(
				{
					getMember: vi.fn().mockResolvedValue({
						id: 'member-1'
					}),
					syncComputedNickname: vi.fn().mockRejectedValue(nicknameTooLongError)
				},
				{
					discordUserId: 'discord-user-1',
					setReason: 'sync'
				}
			)
		).resolves.toEqual({
			kind: 'nickname-too-long'
		});
	});

	it('returns synced when nickname sync succeeds', async () => {
		const member = {
			id: 'member-1'
		};

		await expect(
			syncNicknameForUser(
				{
					getMember: vi.fn().mockResolvedValue(member),
					syncComputedNickname: vi.fn().mockResolvedValue({
						outcome: 'updated',
						member,
						computedNickname: 'ARC NewName'
					})
				},
				{
					discordUserId: 'discord-user-1',
					setReason: 'sync'
				}
			)
		).resolves.toEqual({
			kind: 'synced',
			outcome: 'updated',
			member,
			computedNickname: 'ARC NewName'
		});
	});

	it('returns sync-failed with error details when nickname sync throws unexpectedly', async () => {
		await expect(
			syncNicknameForUser(
				{
					getMember: vi.fn().mockResolvedValue({
						id: 'member-1'
					}),
					syncComputedNickname: vi.fn().mockRejectedValue(new Error('permission denied'))
				},
				{
					discordUserId: 'discord-user-1',
					setReason: 'sync'
				}
			)
		).resolves.toEqual(
			expect.objectContaining({
				kind: 'sync-failed',
				errorMessage: 'permission denied',
				errorName: 'Error'
			})
		);
	});
});
