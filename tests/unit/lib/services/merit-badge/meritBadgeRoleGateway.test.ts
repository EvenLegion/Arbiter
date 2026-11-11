import type { GuildMember } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { createMeritBadgeRoleGateway, toMeritBadgeRoleFailure } from '../../../../../src/lib/services/merit-badge/meritBadgeRoleGateway';

const ROLE_ID = '200000000000000001';

function discordError(code: number) {
	return Object.assign(new Error('Discord API error'), { name: 'DiscordAPIError', code });
}

function fakeMember() {
	return {
		roles: {
			add: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined)
		}
	};
}

describe('createMeritBadgeRoleGateway', () => {
	it('adds and removes one role ID at a time with the audit reason', async () => {
		const member = fakeMember();
		const gateway = createMeritBadgeRoleGateway({ auditReason: 'Merit badge sync after event finalize' });

		await expect(gateway.addRole(member as unknown as GuildMember, ROLE_ID)).resolves.toEqual({ ok: true });
		await expect(gateway.removeRole(member as unknown as GuildMember, ROLE_ID)).resolves.toEqual({ ok: true });

		expect(member.roles.add).toHaveBeenCalledWith(ROLE_ID, 'Merit badge sync after event finalize');
		expect(member.roles.remove).toHaveBeenCalledWith(ROLE_ID, 'Merit badge sync after event finalize');
	});

	it('uses a default audit reason', async () => {
		const member = fakeMember();

		await createMeritBadgeRoleGateway().addRole(member as unknown as GuildMember, ROLE_ID);

		expect(member.roles.add).toHaveBeenCalledWith(ROLE_ID, 'Merit badge sync');
	});

	it('returns a typed failure instead of throwing', async () => {
		const member = fakeMember();
		member.roles.remove.mockRejectedValueOnce(discordError(10011));

		await expect(createMeritBadgeRoleGateway().removeRole(member as unknown as GuildMember, ROLE_ID)).resolves.toEqual({
			ok: false,
			code: 'unknown_role',
			discordErrorCode: 10011,
			errorName: 'DiscordAPIError'
		});
	});
});

describe('toMeritBadgeRoleFailure', () => {
	it.each([
		[50013, 'missing_permissions'],
		[10011, 'unknown_role'],
		[10007, 'unknown_member'],
		[50001, 'request_failed']
	] as const)('maps Discord error %i to %s', (code, expected) => {
		expect(toMeritBadgeRoleFailure(discordError(code))).toMatchObject({ code: expected, discordErrorCode: code });
	});

	it('maps errors without a Discord code to request_failed', () => {
		expect(toMeritBadgeRoleFailure(new Error('socket hang up'))).toEqual({ ok: false, code: 'request_failed', errorName: 'Error' });
		expect(toMeritBadgeRoleFailure('boom')).toEqual({ ok: false, code: 'request_failed' });
	});

	it('maps a string Discord code', () => {
		expect(toMeritBadgeRoleFailure({ code: '10007' })).toEqual({ ok: false, code: 'unknown_member', discordErrorCode: 10007 });
	});
});
