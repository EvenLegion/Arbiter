import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { EventSessionState } from '@prisma/client';
import { ChannelType } from 'discord.js';

import { ENV_DISCORD } from '../config/env';
import { findManyEventSessions, findManyEventTiers, findManyReservedEventVoiceChannelIds } from '../integrations/prisma';
import { handleEventAddVc } from '../lib/features/event-merit/session/handleEventAddVc';
import { handleEventStart } from '../lib/features/event-merit/session/handleEventStart';
import { formatEventSessionStateLabel } from '../lib/features/event-merit/ui/formatEventSessionStateLabel';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<Subcommand.Options>({
	description: 'Event commands',
	preconditions: ['GuildOnly', 'EventOperatorOnly'],
	subcommands: [
		{
			name: 'start',
			chatInputRun: 'chatInputStartEvent'
		},
		{
			name: 'add-vc',
			chatInputRun: 'chatInputAddVc'
		}
	]
})
export class EventCommand extends Subcommand {
	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName('event')
					.setDescription('Event commands.')
					.addSubcommand((subcommand) =>
						subcommand
							.setName('start')
							.setDescription('Create an event draft for your current voice channel.')
							.addStringOption((option) =>
								option.setName('tier_level').setDescription('Event tier level.').setRequired(true).setAutocomplete(true)
							)
							.addStringOption((option) =>
								option
									.setName('event_name')
									.setDescription('Event name shown in tracking and review flows.')
									.setRequired(true)
									.setMinLength(3)
									.setMaxLength(100)
							)
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName('add-vc')
							.setDescription('Add a voice channel as a child VC to a draft or active event.')
							.addStringOption((option) =>
								option
									.setName('event_selection')
									.setDescription('Select a draft or active event.')
									.setRequired(true)
									.setAutocomplete(true)
							)
							.addStringOption((option) =>
								option
									.setName('voice_channel')
									.setDescription('Voice channel to add. If omitted, your current voice channel is used.')
									.setRequired(false)
									.setAutocomplete(true)
							)
							.addStringOption((option) =>
								option
									.setName('rename_channel_to')
									.setDescription('Name for the added voice channel, if not provided, channel can be renamed manually.')
									.setRequired(false)
									.setMinLength(1)
									.setMaxLength(100)
							)
					),
			{
				guildIds: [ENV_DISCORD.DISCORD_GUILD_ID]
			}
		);
	}

	public async chatInputStartEvent(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createExecutionContext({
			bindings: {
				flow: 'event.start',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});

		await handleEventStart({
			interaction,
			context
		});
	}

	public async chatInputAddVc(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createExecutionContext({
			bindings: {
				flow: 'event.addVc',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});

		await handleEventAddVc({
			interaction,
			context
		});
	}

	public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
		try {
			const focused = interaction.options.getFocused(true);
			const subcommandName = interaction.options.getSubcommand(false);
			if (subcommandName === 'start' && focused.name === 'tier_level') {
				const query = String(focused.value).trim().toLowerCase();
				const tiers = await findManyEventTiers({
					isActive: true,
					orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }]
				});
				const filtered = tiers.filter((tier) => {
					if (query.length === 0) {
						return true;
					}

					return (
						tier.name.toLowerCase().includes(query) ||
						tier.code.toLowerCase().includes(query) ||
						tier.description.toLowerCase().includes(query)
					);
				});

				await interaction.respond(
					filtered.slice(0, 25).map((tier) => ({
						name: `${tier.name} ${tier.description} (${tier.meritAmount} merits)`,
						value: String(tier.id)
					}))
				);
				return;
			}

			if (subcommandName === 'add-vc' && focused.name === 'event_selection') {
				const query = String(focused.value).trim();
				// TODO Add caching support so we don't have to query the DB for each autocomplete request
				const sessions = await findManyEventSessions({
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

			if (subcommandName === 'add-vc' && focused.name === 'voice_channel') {
				const guild = await this.container.utilities.guild.getOrThrow().catch((error: unknown) => {
					this.container.logger.error(
						{
							err: error,
							commandName: this.name,
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
				// 1 hour cutoff for empty query string, 24 hour cutoff for non-empty query string
				const cutoffMs = query.length === 0 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
				const cutoffTimestamp = now - cutoffMs;
				const reservedChannelIds = new Set(await findManyReservedEventVoiceChannelIds());
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
			this.container.logger.error(
				{
					err: error,
					commandName: this.name,
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
}
