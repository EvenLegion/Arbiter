import { describe, expect, it, vi } from 'vitest';

import { resolveConfiguredGuildWithDeps } from '../../../../src/lib/discord/resolveConfiguredGuild';
import { resolveGuildMemberWithDeps } from '../../../../src/lib/discord/resolveGuildMember';
import { resolveInteractionActorWithDeps } from '../../../../src/lib/discord/resolveInteractionActor';

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
			id: '55'
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
				centurionRoleId: 'cent-role'
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
					isCenturion: false
				},
				discordTag: 'user#0001'
			}
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
