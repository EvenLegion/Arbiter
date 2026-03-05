import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import type { GuildMember } from 'discord.js';

import { ENV_DISCORD } from '../config/env';
import { findManyEventSessions } from '../integrations/prisma';
import { handleGiveMerit } from '../lib/features/staff/handleGiveMerit';
import { formatEventSessionStateLabel } from '../lib/features/event-merit/ui/formatEventSessionStateLabel';
import { handlePostDivisionMessage } from '../lib/features/staff/postDivisionSelectionMessage';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<Subcommand.Options>({
	description: 'Staff commands',
	preconditions: ['GuildOnly', 'StaffOnly'],
	subcommands: [
		{
			name: 'post-division-message',
			chatInputRun: 'chatInputPostDivisionMessage'
		},
		{
			name: 'give-merit',
			chatInputRun: 'chatInputGiveMerit'
		}
	]
})
export class StaffCommand extends Subcommand {
	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName('staff')
					.setDescription('Staff commands.')
					.addSubcommand((subcommand) =>
						subcommand.setName('post-division-message').setDescription('Post combat and industrial division selection message.')
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName('give-merit')
							.setDescription('Award manual merits to a player.')
							.addStringOption((option) =>
								option.setName('player_name').setDescription('Player to award merits to.').setRequired(true).setAutocomplete(true)
							)
							.addIntegerOption((option) =>
								option
									.setName('number_of_merits')
									.setDescription('How many merits to award.')
									.setRequired(true)
									.setMinValue(1)
									.setMaxValue(10)
							)
							.addStringOption((option) =>
								option
									.setName('reason')
									.setDescription('Optional reason for this manual merit award.')
									.setRequired(false)
									.setMinLength(1)
									.setMaxLength(100)
							)
							.addStringOption((option) =>
								option
									.setName('existing_event')
									.setDescription('Optional event from the last 3 days to link this award to.')
									.setRequired(false)
									.setAutocomplete(true)
							)
					),
			{
				guildIds: [ENV_DISCORD.DISCORD_GUILD_ID]
			}
		);
	}

	public async chatInputPostDivisionMessage(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createExecutionContext({
			bindings: {
				flow: 'staff.postDivisionMessage',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});

		return handlePostDivisionMessage({ interaction, context });
	}

	public async chatInputGiveMerit(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createExecutionContext({
			bindings: {
				flow: 'staff.giveMerit',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});

		return handleGiveMerit({ interaction, context });
	}

	public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
		const focused = interaction.options.getFocused(true);
		const subcommandName = interaction.options.getSubcommand(false);

		if (subcommandName !== 'give-merit') {
			await interaction.respond([]);
			return;
		}

		if (focused.name === 'player_name') {
			const guild = await this.container.utilities.guild.getOrThrow().catch((error: unknown) => {
				this.container.logger.error(
					{
						err: error,
						commandName: this.name,
						subcommandName,
						focusedOptionName: focused.name
					},
					'Failed to resolve configured guild during staff command autocomplete'
				);
				return null;
			});
			if (!guild) {
				await interaction.respond([]);
				return;
			}

			const query = String(focused.value).trim().toLowerCase();
			const cacheMatches = [...guild.members.cache.values()]
				.filter((member) => !member.user.bot)
				.filter((member) => {
					if (query.length === 0) {
						return true;
					}

					const displayName = member.displayName.toLowerCase();
					const username = member.user.username.toLowerCase();
					return displayName.includes(query) || username.includes(query);
				})
				.sort((a, b) => sortMembersByQuery({ a, b, query }));

			const members =
				cacheMatches.length > 0 || query.length === 0
					? cacheMatches
					: await guild.members
							.fetch({
								query,
								limit: 25
							})
							.then((collection) =>
								[...collection.values()].filter((member) => !member.user.bot).sort((a, b) => sortMembersByQuery({ a, b, query }))
							)
							.catch(() => []);

			await interaction.respond(
				members.slice(0, 25).map((member) => ({
					name: `${member.displayName} (@${member.user.username})`.slice(0, 100),
					value: member.id
				}))
			);
			return;
		}

		if (focused.name === 'existing_event') {
			const query = String(focused.value).trim();
			const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
			const sessions = await findManyEventSessions({
				where: {
					createdAt: {
						gte: threeDaysAgo
					}
				},
				include: {
					eventTier: true
				},
				orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
				query,
				limit: 25
			});

			await interaction.respond(
				sessions.map((session) => ({
					name: `${formatRelativeDayLabel(session.createdAt)} | ${session.eventTier.name} | ${session.name} | ${formatEventSessionStateLabel(
						session.state
					)}`.slice(0, 100),
					value: String(session.id)
				}))
			);
			return;
		}

		await interaction.respond([]);
	}
}

function formatRelativeDayLabel(value: Date) {
	const now = new Date();
	const dayDiff = Math.floor((now.getTime() - value.getTime()) / (24 * 60 * 60 * 1000));
	if (dayDiff <= 0) {
		return 'Today';
	}
	if (dayDiff === 1) {
		return 'Yesterday';
	}
	return `${dayDiff}d ago`;
}

function sortMembersByQuery({ a, b, query }: { a: GuildMember; b: GuildMember; query: string }) {
	if (query.length === 0) {
		return a.displayName.localeCompare(b.displayName);
	}

	const aStarts = a.displayName.toLowerCase().startsWith(query) || a.user.username.toLowerCase().startsWith(query);
	const bStarts = b.displayName.toLowerCase().startsWith(query) || b.user.username.toLowerCase().startsWith(query);
	if (aStarts !== bStarts) {
		return aStarts ? -1 : 1;
	}

	return a.displayName.localeCompare(b.displayName);
}
