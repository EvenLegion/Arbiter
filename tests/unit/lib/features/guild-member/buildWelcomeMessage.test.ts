import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWelcomeMessage } from '../../../../../src/lib/features/guild-member/welcome/buildWelcomeMessage';

describe('buildWelcomeMessage', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2025-01-02T03:04:05.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('builds a welcome embed with only the configured guidance fields', () => {
		const message = buildWelcomeMessage({
			guildName: 'Even Legion',
			discordUserId: 'user-1',
			userAvatarUrl: 'https://example.com/avatar.png',
			rulesChannelId: 'rules-1',
			newPlayersChannelId: 'new-players-1'
		});

		expect(message.content).toBe('<@user-1>');
		expect(message.embeds).toHaveLength(1);
		expect(message.embeds?.[0].title).toBe('Welcome to the Even Legion!');
		expect(message.embeds?.[0].description).toContain('welcome to Even Legion');
		expect(message.embeds?.[0].thumbnail).toEqual({
			url: 'https://example.com/avatar.png'
		});
		expect(message.embeds?.[0].fields?.map((field) => field.name)).toEqual(['Server-Rules', 'New Players']);
		expect(message.embeds?.[0].timestamp).toBe('2025-01-02T03:04:05.000Z');
	});

	it('omits optional sections when no channels or avatar are provided', () => {
		const message = buildWelcomeMessage({
			guildName: 'Even Legion',
			discordUserId: 'user-2'
		});

		expect(message.content).toBe('<@user-2>');
		expect(message.embeds?.[0].fields).toEqual([]);
		expect(message.embeds?.[0].thumbnail).toBeUndefined();
	});
});
