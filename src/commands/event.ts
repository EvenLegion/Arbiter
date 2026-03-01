import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';

import { ENV_DISCORD } from '../config/env';
import { findManyActiveEventTiers } from '../integrations/prisma';
import { handleEventStart } from '../lib/features/event-merit/session/handleEventStart';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<Subcommand.Options>({
	description: 'Event commands',
	preconditions: ['GuildOnly', 'EventOperatorOnly'],
	subcommands: [
		{
			name: 'start',
			chatInputRun: 'chatInputStartEvent'
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

	public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
		try {
			const focused = interaction.options.getFocused(true);
			const subcommandName = interaction.options.getSubcommand(false);
			if (subcommandName !== 'start' || focused.name !== 'tier_level') {
				await interaction.respond([]);
				return;
			}

			const query = String(focused.value).trim().toLowerCase();
			const tiers = await findManyActiveEventTiers();
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

			await interaction.respond([]);
		}
	}
}
