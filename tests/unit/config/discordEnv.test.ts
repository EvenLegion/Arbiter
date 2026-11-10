import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEventPingChannelId = process.env.EVENT_PING_CHANNEL_ID;
const originalEventPingRoleId = process.env.EVENT_PING_ROLE_ID;

describe('Discord Event Ping environment validation', () => {
	afterEach(() => {
		restoreEnvironmentValue('EVENT_PING_CHANNEL_ID', originalEventPingChannelId);
		restoreEnvironmentValue('EVENT_PING_ROLE_ID', originalEventPingRoleId);
		vi.resetModules();
	});

	it('fails startup validation when either required Event Ping destination value is missing', async () => {
		delete process.env.EVENT_PING_CHANNEL_ID;
		delete process.env.EVENT_PING_ROLE_ID;
		vi.resetModules();

		await expect(import('../../../src/config/env/discord')).rejects.toThrow(/EVENT_PING_CHANNEL_ID:/);
		await expect(import('../../../src/config/env/discord')).rejects.toThrow(/EVENT_PING_ROLE_ID:/);
	});
});

function restoreEnvironmentValue(key: 'EVENT_PING_CHANNEL_ID' | 'EVENT_PING_ROLE_ID', value: string | undefined) {
	if (value === undefined) {
		delete process.env[key];
		return;
	}

	process.env[key] = value;
}

describe('merit badge role environment validation', () => {
	afterEach(() => {
		delete process.env.MERIT_BADGE_FERRUM_I_ROLE_ID;
		delete process.env.MERIT_BADGE_FERRUM_II_ROLE_ID;
		vi.resetModules();
	});

	it('leaves badge sync off when no badge role variable is set', async () => {
		vi.resetModules();

		const { ENV_MERIT_BADGE_ROLES } = await import('../../../src/config/env/discord');

		expect(ENV_MERIT_BADGE_ROLES.isEnabled).toBe(false);
	});

	it('reads configured badge roles at boot', async () => {
		process.env.MERIT_BADGE_FERRUM_I_ROLE_ID = '100000000000000001';
		vi.resetModules();

		const { ENV_MERIT_BADGE_ROLES } = await import('../../../src/config/env/discord');

		expect(ENV_MERIT_BADGE_ROLES.byTier(1)).toBe('100000000000000001');
	});

	it('fails boot validation for a duplicate badge role ID', async () => {
		process.env.MERIT_BADGE_FERRUM_I_ROLE_ID = '100000000000000001';
		process.env.MERIT_BADGE_FERRUM_II_ROLE_ID = '100000000000000001';
		vi.resetModules();

		await expect(import('../../../src/config/env/discord')).rejects.toThrow(/MERIT_BADGE_FERRUM_II_ROLE_ID: uses the same role ID/);
	});

	it('fails boot validation for a value that is not a role ID', async () => {
		process.env.MERIT_BADGE_FERRUM_I_ROLE_ID = 'dummy';
		vi.resetModules();

		await expect(import('../../../src/config/env/discord')).rejects.toThrow(/MERIT_BADGE_FERRUM_I_ROLE_ID: must be a Discord role ID/);
	});
});
