import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { DivisionKind } from '@prisma/client';
import type { GuildMember } from 'discord.js';

import { ENV_DISCORD } from '../config/env';
import { findManyEventSessions } from '../integrations/prisma';
import { handleGiveMerit } from '../lib/features/merit/handleGiveMerit';
import { handleMeritList } from '../lib/features/merit/handleMeritList';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<Subcommand.Options>({
	description: 'Merit commands',
	preconditions: ['GuildOnly'],
	subcommands: [
		{
			name: 'give',
			chatInputRun: 'chatInputGive'
		},
		{
			name: 'list',
			chatInputRun: 'chatInputList'
		}
	]
})
export class MeritCommand extends Subcommand {
	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName('merit')
					.setDescription('Merit commands.')
					.addSubcommand((subcommand) =>
						subcommand
							.setName('give')
							.setDescription('Award manual merits to a player (staff only).')
							.addStringOption((option) =>
								option.setName('player_name').setDescription('Player to award merits to.').setRequired(true).setAutocomplete(true)
							)
							.addIntegerOption((option) =>
								option.setName('number_of_merits').setDescription('How many merits to award.').setRequired(true).setMinValue(1)
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
									.setDescription('Optional event from the last 5 days to link this award to.')
									.setRequired(false)
									.setAutocomplete(true)
							)
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName('list')
							.setDescription('List merit awards for yourself or another user (staff only).')
							.addStringOption((option) =>
								option
									.setName('user_name')
									.setDescription('User to list merits for (staff only).')
									.setRequired(false)
									.setAutocomplete(true)
							)
							.addBooleanOption((option) =>
								option
									.setName('private')
									.setDescription('Whether the response is private (staff only). Defaults to true.')
									.setRequired(false)
							)
					),
			{
				guildIds: [ENV_DISCORD.DISCORD_GUILD_ID]
			}
		);
	}

	public async chatInputList(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createExecutionContext({
			bindings: {
				flow: 'merit.list',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});

		return handleMeritList({
			interaction,
			context
		});
	}

	public async chatInputGive(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createExecutionContext({
			bindings: {
				flow: 'merit.give',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});

		return handleGiveMerit({ interaction, context });
	}

	public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
		const subcommandName = interaction.options.getSubcommand(false);
		const focused = interaction.options.getFocused(true);
		if (subcommandName !== 'list' && subcommandName !== 'give') {
			await interaction.respond([]);
			return;
		}

		const guild = await this.container.utilities.guild.getOrThrow().catch((error: unknown) => {
			this.container.logger.error(
				{
					err: error,
					commandName: this.name,
					subcommandName,
					focusedOptionName: focused.name
				},
				'Failed to resolve configured guild during merit command autocomplete'
			);
			return null;
		});
		if (!guild) {
			await interaction.respond([]);
			return;
		}

		const requesterMember = await this.container.utilities.member
			.getOrThrow({
				guild,
				discordUserId: interaction.user.id
			})
			.catch(() => null);
		if (!requesterMember) {
			await interaction.respond([]);
			return;
		}

		const requesterIsStaff = await this.container.utilities.divisionRolePolicy.memberHasDivisionKindRole({
			member: requesterMember,
			requiredRoleKinds: [DivisionKind.STAFF]
		});

		if (subcommandName === 'give' && !requesterIsStaff) {
			await interaction.respond([]);
			return;
		}

		if (subcommandName === 'give' && focused.name === 'existing_event') {
			const query = String(focused.value).trim();
			const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
			const sessions = await findManyEventSessions({
				where: {
					createdAt: {
						gte: fiveDaysAgo
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
					name: `${formatRelativeDayLabel(session.createdAt)} | ${session.eventTier.name} | ${session.name}`.slice(0, 100),
					value: String(session.id)
				}))
			);
			return;
		}

		if (focused.name !== 'user_name' && focused.name !== 'player_name') {
			await interaction.respond([]);
			return;
		}

		if (!requesterIsStaff) {
			await interaction.respond([
				{
					name: `${requesterMember.displayName}`.slice(0, 100),
					value: requesterMember.id
				}
			]);
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
				return displayName.includes(query);
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
				name: `${member.displayName}`.slice(0, 100),
				value: member.id
			}))
		);
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
	return `${dayDiff} days ago`;
}

function sortMembersByQuery({ a, b, query }: { a: GuildMember; b: GuildMember; query: string }) {
	if (query.length === 0) {
		return a.displayName.localeCompare(b.displayName);
	}

	const aStarts = a.displayName.toLowerCase().startsWith(query);
	const bStarts = b.displayName.toLowerCase().startsWith(query);
	if (aStarts !== bStarts) {
		return aStarts ? -1 : 1;
	}

	return a.displayName.localeCompare(b.displayName);
}
