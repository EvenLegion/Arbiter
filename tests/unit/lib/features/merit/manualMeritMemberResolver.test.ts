import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createGuildMemberAccessGateway: vi.fn()
}));

vi.mock('../../../../../src/lib/features/guild-member/guildMemberAccessGateway', () => ({
	createGuildMemberAccessGateway: mocks.createGuildMemberAccessGateway
}));

import {
	createManualMeritMemberResolver,
	mapMemberToResolvedMember
} from '../../../../../src/lib/features/merit/manual-award/manualMeritMemberResolver';

describe('manualMeritMemberResolver', () => {
	beforeEach(() => {
		mocks.createGuildMemberAccessGateway.mockReset();
	});

	it('maps guild members into manual-merit service members', () => {
		expect(
			mapMemberToResolvedMember({
				id: '42',
				displayName: 'Display',
				user: {
					username: 'user42',
					globalName: 'Global 42',
					bot: false,
					displayAvatarURL: () => 'https://avatar.test/42'
				}
			} as never)
		).toEqual({
			discordUserId: '42',
			discordUsername: 'user42',
			discordDisplayName: 'Display',
			discordGlobalName: 'Global 42',
			discordAvatarUrl: 'https://avatar.test/42',
			isBot: false
		});
	});

	it('resolves target members through the shared guild-member access gateway', async () => {
		const findMemberByInput = vi.fn().mockResolvedValue({
			id: '84',
			displayName: 'Member 84',
			user: {
				username: 'user84',
				globalName: null,
				bot: false,
				displayAvatarURL: () => 'https://avatar.test/84'
			}
		});
		const getMember = vi.fn();
		mocks.createGuildMemberAccessGateway.mockReturnValue({
			findMemberByInput,
			getMember
		});

		const resolver = createManualMeritMemberResolver({
			guild: {
				id: 'guild-1'
			} as never,
			awarderMember: {
				id: '42'
			} as never
		});

		await expect(resolver.resolveTargetMember('84')).resolves.toEqual({
			discordUserId: '84',
			discordUsername: 'user84',
			discordDisplayName: 'Member 84',
			discordGlobalName: null,
			discordAvatarUrl: 'https://avatar.test/84',
			isBot: false
		});
		expect(findMemberByInput).toHaveBeenCalledWith('84');
		expect(resolver.getMember).toBe(getMember);
	});
});
