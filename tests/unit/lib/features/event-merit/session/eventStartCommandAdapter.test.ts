import { ChannelType } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getDbUserOrThrow: vi.fn()
}));

vi.mock('../../../../../../src/lib/discord/userDirectoryGateway', () => ({
	getDbUserOrThrow: mocks.getDbUserOrThrow
}));

import { resolveEventStartCommand } from '../../../../../../src/lib/features/event-merit/session/eventStartCommandAdapter';

describe('eventStartCommandAdapter', () => {
	beforeEach(() => {
		mocks.getDbUserOrThrow.mockReset();
	});

	it('fails when the issuer is not in voice', async () => {
		const result = await resolveEventStartCommand({
			interaction: createInteraction(),
			guild: createGuild(null),
			issuer: createIssuer(null),
			logger: {
				error: vi.fn()
			}
		});

		expect(result).toEqual({
			kind: 'fail',
			delivery: 'editReply',
			content: 'You must be in a voice channel to start an event.'
		});
	});

	it('returns a ready command payload when validation passes', async () => {
		mocks.getDbUserOrThrow.mockResolvedValue({
			id: 'db-user-1'
		});

		const result = await resolveEventStartCommand({
			interaction: createInteraction(),
			guild: createGuild({
				id: 'tracking-channel',
				type: ChannelType.GuildText
			}),
			issuer: createIssuer('voice-1'),
			logger: {
				error: vi.fn()
			}
		});

		expect(result).toEqual({
			kind: 'ready',
			trackingChannel: expect.objectContaining({
				id: 'tracking-channel'
			}),
			createDraftInput: {
				hostDbUserId: 'db-user-1',
				hostDiscordUserId: 'issuer-1',
				issuerTag: 'issuer#0001',
				eventTierId: 2,
				eventName: 'Friday Op',
				primaryVoiceChannelId: 'voice-1'
			}
		});
	});
});

function createInteraction() {
	return {
		options: {
			getString: vi.fn((name: string) => {
				if (name === 'tier_level') {
					return '2';
				}
				if (name === 'event_name') {
					return 'Friday Op';
				}
				return null;
			})
		},
		user: {
			id: 'issuer-1',
			tag: 'issuer#0001'
		}
	} as never;
}

function createGuild(trackingChannel: { id: string; type: ChannelType } | null) {
	return {
		channels: {
			cache: new Map(trackingChannel ? [[trackingChannel.id, trackingChannel]] : []),
			fetch: vi.fn(async () => trackingChannel)
		}
	} as never;
}

function createIssuer(channelId: string | null) {
	return {
		id: 'issuer-1',
		voice: {
			channelId
		}
	} as never;
}
