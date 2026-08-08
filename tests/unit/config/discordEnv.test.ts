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
