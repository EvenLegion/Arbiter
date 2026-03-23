import { describe, expect, it, vi } from 'vitest';

import { resolveConfiguredGuildWithDeps } from '../../../../src/lib/discord/interactions/interactionPreflight';
import { resolveGuildMemberWithDeps } from '../../../../src/lib/discord/interactions/interactionPreflight';
import { resolveInteractionActorWithDeps } from '../../../../src/lib/discord/interactions/interactionPreflight';

describe('interactionPreflight helpers', () => {
	it('fails through the responder when configured guild lookup fails', async () => {
		const responder = createResponder();
		const logger = createLogger();

		const result = await resolveConfiguredGuildWithDeps(
			{
				getConfiguredGuild: async () => {
					throw new Error('missing guild');
				}
			},
			{
				interaction: {
					guild: null
				},
				responder,
				logger,
				logMessage: 'guild failed',
				failureMessage: 'Could not resolve configured guild',
				requestId: true
			}
		);

		expect(result).toBeNull();
		expect(responder.fail).toHaveBeenCalledWith('Could not resolve configured guild', {
			requestId: true
		});
		expect(logger.error).toHaveBeenCalled();
	});

	it('returns null and emits a failure when the guild member cannot be resolved', async () => {
		const responder = createResponder();

		const result = await resolveGuildMemberWithDeps(
			{
				getMember: async () => {
					throw new Error('member missing');
				}
			},
			{
				guild: {} as never,
				discordUserId: '42',
				responder,
				logger: createLogger(),
				logMessage: 'member failed',
				failureMessage: 'Missing member'
			}
		);

		expect(result).toBeNull();
		expect(responder.fail).toHaveBeenCalledWith('Missing member', {
			requestId: false
		});
	});

	it('builds actor capabilities and optional db user from injected deps', async () => {
		const responder = createResponder();
		const member = {
			id: '55',
			roles: {
				cache: {
					has: () => false
				}
			}
		} as never;

		const result = await resolveInteractionActorWithDeps(
			{
				getConfiguredGuild: async () => ({}) as never,
				getMember: async () => member,
				hasDivisionKindRole: async () => true,
				hasDivision: async () => false,
				getDbUser: async () => ({
					id: 'db-55'
				}),
				centurionRoleId: 'cent-role',
				optioRoleId: 'optio-role'
			},
			{
				guild: {} as never,
				discordUserId: '55',
				responder,
				logger: createLogger(),
				logMessage: 'actor failed',
				failureMessage: 'Missing actor',
				capabilityRequirement: 'staff',
				resolveDbUser: true,
				discordTag: 'user#0001'
			}
		);

		expect(result).toEqual({
			member,
			dbUser: {
				id: 'db-55'
			},
			actor: {
				discordUserId: '55',
				dbUserId: 'db-55',
				capabilities: {
					isStaff: true,
					isCenturion: false,
					isOptio: false
				},
				discordTag: 'user#0001'
			}
		});
		expect(responder.fail).not.toHaveBeenCalled();
	});

	it('treats optio members as centurion-capable actors', async () => {
		const responder = createResponder();
		const member = {
			id: '55',
			roles: {
				cache: {
					has: (roleId: string) => roleId === 'optio-role'
				}
			}
		} as never;

		const result = await resolveInteractionActorWithDeps(
			{
				getConfiguredGuild: async () => ({}) as never,
				getMember: async () => member,
				hasDivisionKindRole: async () => false,
				hasDivision: async ({ divisionDiscordRoleId }) => divisionDiscordRoleId === 'optio-role',
				getDbUser: async () => ({
					id: 'db-55'
				}),
				centurionRoleId: 'cent-role',
				optioRoleId: 'optio-role'
			},
			{
				guild: {} as never,
				discordUserId: '55',
				responder,
				logger: createLogger(),
				logMessage: 'actor failed',
				failureMessage: 'Missing actor',
				capabilityRequirement: 'staff-or-centurion'
			}
		);

		expect(result?.actor.capabilities).toEqual({
			isStaff: false,
			isCenturion: false,
			isOptio: true
		});
		expect(responder.fail).not.toHaveBeenCalled();
	});
});

function createResponder() {
	return {
		fail: vi.fn(async () => undefined)
	};
}

function createLogger() {
	return {
		error: vi.fn()
	};
}
