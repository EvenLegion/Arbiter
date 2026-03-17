import { ChannelType, type Guild } from 'discord.js';

export type EventVoiceChannelAutocompleteChoice = {
	name: string;
	value: string;
};

export async function buildAvailableEventVoiceChannelChoices({
	guild,
	query,
	reservedChannelIds,
	limit = 25
}: {
	guild: Guild;
	query: string;
	reservedChannelIds: Iterable<string>;
	limit?: number;
}): Promise<EventVoiceChannelAutocompleteChoice[]> {
	const normalizedQuery = query.trim().toLowerCase();
	const reservedIds = new Set(reservedChannelIds);
	const now = Date.now();
	const cutoffMs = normalizedQuery.length === 0 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
	const cutoffTimestamp = now - cutoffMs;

	return guild.channels.cache
		.filter((channel) => channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice)
		.filter((channel) => !reservedIds.has(channel.id))
		.map((channel) => ({
			id: channel.id,
			name: channel.name,
			createdTimestamp: channel.createdTimestamp ?? 0,
			matchIndex: normalizedQuery.length === 0 ? 0 : channel.name.toLowerCase().indexOf(normalizedQuery)
		}))
		.filter((channel) => channel.createdTimestamp >= cutoffTimestamp)
		.filter((channel) => channel.matchIndex >= 0)
		.sort((left, right) => {
			if (left.matchIndex !== right.matchIndex) {
				return left.matchIndex - right.matchIndex;
			}

			return right.createdTimestamp - left.createdTimestamp;
		})
		.slice(0, limit)
		.map((channel) => ({
			name: channel.name.slice(0, 100),
			value: channel.id
		}));
}
