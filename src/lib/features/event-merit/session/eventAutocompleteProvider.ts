import { EventSessionState } from '@prisma/client';
import { container } from '@sapphire/framework';
import { ChannelType } from 'discord.js';

import type { Subcommand } from '@sapphire/plugin-subcommands';

import { eventRepository } from '../../../../integrations/prisma/repositories';
import { formatEventSessionStateLabel } from '../ui/formatEventSessionStateLabel';

type HandleEventAutocompleteParams = {
	interaction: Subcommand.AutocompleteInteraction;
	commandName?: string;
};

export async function handleEventAutocomplete({ interaction, commandName = 'event' }: HandleEventAutocompleteParams) {
	try {
		const focused = interaction.options.getFocused(true);
		const subcommandName = interaction.options.getSubcommand(false);
		if (subcommandName === 'start' && focused.name === 'tier_level') {
			const query = String(focused.value).trim().toLowerCase();
			const tiers = await eventRepository.listEventTiers({
				orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }]
			});
			const filtered = tiers.filter(
				(tier) =>
					query.length === 0 ||
					tier.name.toLowerCase().includes(query) ||
					tier.code.toLowerCase().includes(query) ||
					tier.description.toLowerCase().includes(query)
			);

			await interaction.respond(
				filtered.slice(0, 25).map((tier) => ({
					name: `${tier.name} ${tier.description} (${tier.meritType.meritAmount} merits)`,
					value: String(tier.id)
				}))
			);
			return;
		}

		if (subcommandName === 'add_vc' && focused.name === 'event_selection') {
			const query = String(focused.value).trim();
			const sessions = await eventRepository.listSessions({
				states: [EventSessionState.DRAFT, EventSessionState.ACTIVE],
				query,
				limit: 25,
				include: {
					eventTier: true
				},
				orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
			});
			await interaction.respond(
				sessions.map((session) => ({
					name: `${session.eventTier.name} | ${session.name} | ${formatEventSessionStateLabel(session.state)}`,
					value: String(session.id)
				}))
			);
			return;
		}

		if (subcommandName === 'add_vc' && focused.name === 'voice_channel') {
			const guild = await container.utilities.guild.getOrThrow().catch((error: unknown) => {
				container.logger.error(
					{
						err: error,
						commandName,
						subcommandName,
						focusedOptionName: focused.name
					},
					'Failed to resolve configured guild during event command autocomplete'
				);
				return null;
			});
			if (!guild) {
				await interaction.respond([]);
				return;
			}

			const query = String(focused.value).trim().toLowerCase();
			const now = Date.now();
			const cutoffMs = query.length === 0 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
			const cutoffTimestamp = now - cutoffMs;
			const reservedChannelIds = new Set(await eventRepository.listReservedVoiceChannelIds());
			const channels = guild.channels.cache
				.filter((channel) => channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice)
				.filter((channel) => !reservedChannelIds.has(channel.id))
				.map((channel) => ({
					id: channel.id,
					name: channel.name,
					createdTimestamp: channel.createdTimestamp ?? 0,
					matchIndex: query.length === 0 ? 0 : channel.name.toLowerCase().indexOf(query)
				}))
				.filter((channel) => channel.createdTimestamp >= cutoffTimestamp)
				.filter((channel) => channel.matchIndex >= 0)
				.sort((a, b) => {
					if (a.matchIndex !== b.matchIndex) {
						return a.matchIndex - b.matchIndex;
					}

					return b.createdTimestamp - a.createdTimestamp;
				});

			await interaction.respond(
				channels.slice(0, 25).map((channel) => ({
					name: channel.name.slice(0, 100),
					value: channel.id
				}))
			);
			return;
		}

		if (!interaction.responded) {
			await interaction.respond([]);
		}
	} catch (error) {
		container.logger.error(
			{
				err: error,
				commandName,
				subcommandName: interaction.options.getSubcommand(false),
				focusedOptionName: interaction.options.getFocused(true).name
			},
			'Encountered error in event command autocomplete'
		);

		if (!interaction.responded) {
			await interaction.respond([]);
		}
	}
}
