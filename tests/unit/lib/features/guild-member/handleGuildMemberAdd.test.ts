import type { GuildMember } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockExecutionContext, createMockLogger } from '../../../../support/logger';

const mocks = vi.hoisted(() => ({
	upsert: vi.fn(),
	createMeritBadgeSyncRuntime: vi.fn(),
	syncMember: vi.fn()
}));

vi.mock('../../../../../src/integrations/prisma/repositories', () => ({
	userRepository: {
		upsert: mocks.upsert
	}
}));

vi.mock('../../../../../src/lib/services/merit-badge/createMeritBadgeSyncRuntime', () => ({
	createMeritBadgeSyncRuntime: mocks.createMeritBadgeSyncRuntime
}));

import { handleGuildMemberAdd } from '../../../../../src/lib/features/guild-member/handlers/handleGuildMemberAdd';

describe('handleGuildMemberAdd', () => {
	beforeEach(() => {
		mocks.upsert.mockReset().mockResolvedValue({ id: 'db-42' });
		mocks.syncMember.mockReset().mockResolvedValue({ kind: 'updated' });
		mocks.createMeritBadgeSyncRuntime.mockReset().mockReturnValue({ syncMember: mocks.syncMember });
	});

	it('restores a returning member badge with a fresh total, then sends the welcome', async () => {
		const { member, send } = createJoiningMember();
		const context = createMockExecutionContext();

		await handleGuildMemberAdd({ member, context });

		expect(mocks.createMeritBadgeSyncRuntime).toHaveBeenCalledWith(expect.objectContaining({ guild: member.guild, context }));
		expect(mocks.syncMember).toHaveBeenCalledWith({ discordUserId: '42' });
		expect(mocks.syncMember.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.upsert.mock.invocationCallOrder[0]);
		expect(send).toHaveBeenCalledTimes(1);
	});

	it('still sends the welcome when the badge sync throws', async () => {
		mocks.syncMember.mockRejectedValueOnce(new Error('boom'));
		const { member, send } = createJoiningMember();
		const logger = createMockLogger();

		await handleGuildMemberAdd({ member, context: createMockExecutionContext({ logger }) });

		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ discordUserId: '42' }),
			'Failed to restore merit badge for joining member'
		);
		expect(send).toHaveBeenCalledTimes(1);
	});

	it('skips the badge outside the configured guild', async () => {
		const { member, send } = createJoiningMember('other-guild');

		await handleGuildMemberAdd({ member, context: createMockExecutionContext() });

		expect(mocks.createMeritBadgeSyncRuntime).not.toHaveBeenCalled();
		expect(send).toHaveBeenCalledTimes(1);
	});
});

function createJoiningMember(guildId = 'test-guild-id') {
	const send = vi.fn().mockResolvedValue(undefined);
	const member = {
		nickname: null,
		user: {
			id: '42',
			username: 'joiner',
			globalName: null,
			bot: false,
			displayAvatarURL: () => 'https://example.com/42.png'
		},
		guild: {
			id: guildId,
			name: 'Legion',
			channels: {
				fetch: vi.fn().mockResolvedValue({
					isTextBased: () => true,
					send
				})
			}
		}
	};

	return { member: member as unknown as GuildMember, send };
}
