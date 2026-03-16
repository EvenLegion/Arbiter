import { DivisionKind } from '@prisma/client';
import { container } from '@sapphire/framework';

import type { Subcommand } from '@sapphire/plugin-subcommands';

import { resolveAutocompleteGuild, respondWithAutocompleteChoices } from '../../discord/autocompleteResponder';
import { eventRepository, meritRepository } from '../../../integrations/prisma/repositories';
import { buildGuildMemberAutocompleteChoices } from '../../discord/memberDirectory';

type HandleMeritAutocompleteParams = {
	interaction: Subcommand.AutocompleteInteraction;
	commandName?: string;
};

export async function handleMeritAutocomplete({ interaction, commandName = 'merit' }: HandleMeritAutocompleteParams) {
	const subcommandName = interaction.options.getSubcommand(false);
	const focused = interaction.options.getFocused(true);
	if (subcommandName !== 'list' && subcommandName !== 'give') {
		await interaction.respond([]);
		return;
	}

	const guild = await resolveAutocompleteGuild({
		interaction,
		loggerContext: {
			commandName,
			subcommandName,
			focusedOptionName: focused.name
		},
		logMessage: 'Failed to resolve configured guild during merit command autocomplete'
	});
	if (!guild) {
		return;
	}

	const requesterMember = await container.utilities.member
		.getOrThrow({
			guild,
			discordUserId: interaction.user.id
		})
		.catch(() => null);
	if (!requesterMember) {
		await interaction.respond([]);
		return;
	}

	const requesterIsStaff = await container.utilities.divisionRolePolicy.memberHasDivisionKindRole({
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
		const sessions = await eventRepository.listSessions({
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

		await respondWithAutocompleteChoices({
			interaction,
			choices: sessions.map((session) => ({
				name: `${formatRelativeDayLabel(session.createdAt)} | ${session.eventTier.name} | ${session.name}`.slice(0, 100),
				value: String(session.id)
			})),
			loggerContext: {
				commandName,
				subcommandName,
				focusedOptionName: focused.name,
				query
			},
			logMessage: 'Failed to respond to merit existing_event autocomplete'
		});
		return;
	}

	if (subcommandName === 'give' && focused.name === 'merit_type') {
		const query = String(focused.value).trim();
		const meritTypes = await meritRepository.listMeritTypes({
			query,
			where: {
				isManualAwardable: true
			},
			orderBy: [{ meritAmount: 'desc' }, { name: 'asc' }],
			limit: 25
		});
		await respondWithAutocompleteChoices({
			interaction,
			choices: meritTypes.map((type) => ({
				name: `${type.name} (${formatSignedMeritAmount(type.meritAmount)} merits)`.slice(0, 100),
				value: type.code
			})),
			loggerContext: {
				commandName,
				subcommandName,
				focusedOptionName: focused.name,
				query
			},
			logMessage: 'Failed to respond to merit merit_type autocomplete'
		});
		return;
	}

	if (focused.name !== 'user_name' && focused.name !== 'player_name') {
		await interaction.respond([]);
		return;
	}

	if (!requesterIsStaff) {
		await respondWithAutocompleteChoices({
			interaction,
			choices: [
				{
					name: requesterMember.displayName.slice(0, 100),
					value: requesterMember.id
				}
			],
			loggerContext: {
				commandName,
				subcommandName,
				focusedOptionName: focused.name
			},
			logMessage: 'Failed to respond to merit self autocomplete'
		});
		return;
	}

	const choices = await buildGuildMemberAutocompleteChoices({
		guild,
		query: String(focused.value).trim().toLowerCase()
	}).catch(() => null);
	if (!choices) {
		await interaction.respond([]);
		return;
	}

	await respondWithAutocompleteChoices({
		interaction,
		choices,
		loggerContext: {
			commandName,
			subcommandName,
			focusedOptionName: focused.name
		},
		logMessage: 'Failed to respond to merit member autocomplete'
	});
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

function formatSignedMeritAmount(amount: number) {
	return amount >= 0 ? `+${amount}` : `${amount}`;
}
