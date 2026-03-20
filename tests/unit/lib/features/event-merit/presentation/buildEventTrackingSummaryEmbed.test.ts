import { EventSessionState } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { buildEventTrackingSummaryEmbed } from '../../../../../../src/lib/features/event-merit/presentation/shared/buildEventTrackingSummaryEmbed';

describe('buildEventTrackingSummaryEmbed', () => {
	it('builds the tracking summary with linked channels and thread details', () => {
		const embed = buildEventTrackingSummaryEmbed({
			eventSessionId: 12,
			eventName: 'Weekly Operation',
			tierName: 'Tier 2',
			tierMeritAmount: 4,
			hostDiscordUserId: 'host-1',
			trackedChannelIds: ['voice-1', 'voice-2'],
			trackingThreadId: 'thread-1',
			state: EventSessionState.ACTIVE
		});

		expect(embed.data.title).toBe('Event Tracking Summary');
		expect(embed.data.fields?.find((field) => field.name === 'Event Name')?.value).toBe('Weekly Operation');
		expect(embed.data.fields?.find((field) => field.name === 'Tier')?.value).toBe('Tier 2 (4 merits)');
		expect(embed.data.fields?.find((field) => field.name === 'State')?.value).toBe('Active');
		expect(embed.data.fields?.find((field) => field.name === 'Host')?.value).toBe('<@host-1>');
		expect(embed.data.fields?.find((field) => field.name === 'Tracking Thread')?.value).toBe('<#thread-1>');
		expect(embed.data.fields?.find((field) => field.name === 'Tracked Voice Channels')?.value).toBe('<#voice-1>\n<#voice-2>');
		expect(embed.data.footer?.text).toBe('Event session ID: 12');
	});

	it('falls back to plain status text when thread or tracked channels are missing', () => {
		const embed = buildEventTrackingSummaryEmbed({
			eventSessionId: 34,
			eventName: 'Cleanup',
			tierName: 'Tier 1',
			tierMeritAmount: 2,
			hostDiscordUserId: 'host-2',
			trackedChannelIds: [],
			trackingThreadId: null,
			state: EventSessionState.CANCELLED
		});

		expect(embed.data.fields?.find((field) => field.name === 'Tracking Thread')?.value).toBe('Not available');
		expect(embed.data.fields?.find((field) => field.name === 'Tracked Voice Channels')?.value).toBe('No channels configured');
		expect(embed.data.fields?.find((field) => field.name === 'State')?.value).toBe('Cancelled');
	});
});
