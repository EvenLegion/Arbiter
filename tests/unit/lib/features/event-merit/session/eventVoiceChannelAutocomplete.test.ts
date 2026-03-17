import { Collection, ChannelType } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { buildAvailableEventVoiceChannelChoices } from '../../../../../../src/lib/features/event-merit/session/eventVoiceChannelAutocomplete';

describe('eventVoiceChannelAutocomplete', () => {
	it('filters reserved channels and ranks prefix matches ahead of later matches', async () => {
		const now = Date.now();
		const guild = {
			channels: {
				cache: new Collection([
					[
						'voice-1',
						{
							id: 'voice-1',
							name: 'Alpha Raid',
							type: ChannelType.GuildVoice,
							createdTimestamp: now
						}
					],
					[
						'voice-2',
						{
							id: 'voice-2',
							name: 'Raid Alpha',
							type: ChannelType.GuildVoice,
							createdTimestamp: now - 1_000
						}
					],
					[
						'voice-3',
						{
							id: 'voice-3',
							name: 'Reserved Alpha',
							type: ChannelType.GuildVoice,
							createdTimestamp: now
						}
					]
				])
			}
		} as never;

		const choices = await buildAvailableEventVoiceChannelChoices({
			guild,
			query: 'alpha',
			reservedChannelIds: ['voice-3']
		});

		expect(choices).toEqual([
			{
				name: 'Alpha Raid',
				value: 'voice-1'
			},
			{
				name: 'Raid Alpha',
				value: 'voice-2'
			}
		]);
	});
});
