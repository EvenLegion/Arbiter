import { ChannelType } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getDbUserOrThrow: vi.fn(),
	listEventTiers: vi.fn()
}));

vi.mock('../../../../../../src/lib/discord/guild/users', () => ({
	getDbUserOrThrow: mocks.getDbUserOrThrow
}));

vi.mock('../../../../../../src/integrations/prisma/repositories', () => ({
	eventRepository: {
		listEventTiers: mocks.listEventTiers
	}
}));

import { resolveEventStartCommand } from '../../../../../../src/lib/features/event-merit/session/draft/resolveEventStartCommand';

describe('resolveEventStartCommand', () => {
	beforeEach(() => {
		mocks.getDbUserOrThrow.mockReset();
		mocks.listEventTiers.mockReset();
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
		mocks.listEventTiers.mockResolvedValue(createEventTiers());

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
				eventTierId: 3,
				eventName: 'Friday Op',
				primaryVoiceChannelId: 'voice-1'
			}
		});
	});

	it('maps a typed numeric tier level to the tier display order instead of the raw database id', async () => {
		mocks.getDbUserOrThrow.mockResolvedValue({
			id: 'db-user-1'
		});
		mocks.listEventTiers.mockResolvedValue(createEventTiers());

		const result = await resolveEventStartCommand({
			interaction: createInteraction({
				tierLevel: '1'
			}),
			guild: createGuild({
				id: 'tracking-channel',
				type: ChannelType.GuildText
			}),
			issuer: createIssuer('voice-1'),
			logger: {
				error: vi.fn()
			}
		});

		expect(result).toEqual(
			expect.objectContaining({
				kind: 'ready',
				createDraftInput: expect.objectContaining({
					eventTierId: 2
				})
			})
		);
	});

	it('accepts the stable tier code returned by autocomplete', async () => {
		mocks.getDbUserOrThrow.mockResolvedValue({
			id: 'db-user-1'
		});
		mocks.listEventTiers.mockResolvedValue(createEventTiers());

		const result = await resolveEventStartCommand({
			interaction: createInteraction({
				tierLevel: 'TIER_1'
			}),
			guild: createGuild({
				id: 'tracking-channel',
				type: ChannelType.GuildText
			}),
			issuer: createIssuer('voice-1'),
			logger: {
				error: vi.fn()
			}
		});

		expect(result).toEqual(
			expect.objectContaining({
				kind: 'ready',
				createDraftInput: expect.objectContaining({
					eventTierId: 2
				})
			})
		);
	});
});

function createInteraction({ tierLevel = '2' }: { tierLevel?: string } = {}) {
	return {
		options: {
			getString: vi.fn((name: string) => {
				if (name === 'tier_level') {
					return tierLevel;
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

function createEventTiers() {
	return [
		{
			id: 1,
			code: 'TIER_0',
			name: 'Tier 0',
			description: 'Casual Op',
			displayOrder: 0
		},
		{
			id: 2,
			code: 'TIER_1',
			name: 'Tier 1',
			description: 'Experienced Op',
			displayOrder: 1
		},
		{
			id: 3,
			code: 'TIER_2',
			name: 'Tier 2',
			description: 'Advanced Op',
			displayOrder: 2
		}
	];
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
