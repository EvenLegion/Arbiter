import type { Subcommand } from '@sapphire/plugin-subcommands';

import { resolveAutocompleteGuild, respondWithAutocompleteChoices } from '../../discord/autocompleteResponder';
import { buildGuildMemberAutocompleteChoices } from '../../discord/memberDirectory';
import { buildDivisionAutocompleteChoices } from '../division-selection/divisionDirectory';

type HandleStaffAutocompleteParams = {
	interaction: Subcommand.AutocompleteInteraction;
	commandName?: string;
};

export async function handleStaffAutocomplete({ interaction, commandName = 'staff' }: HandleStaffAutocompleteParams) {
	const subcommandGroupName = interaction.options.getSubcommandGroup(false);
	const subcommandName = interaction.options.getSubcommand(false);
	const focused = interaction.options.getFocused(true);

	if (
		(subcommandName === 'sync_nickname' && focused.name === 'user') ||
		(subcommandGroupName === 'division_membership' && focused.name === 'nickname')
	) {
		await respondWithGuildMemberAutocomplete({
			interaction,
			commandName,
			subcommandGroupName,
			subcommandName,
			focusedOptionName: focused.name
		});
		return;
	}

	if (subcommandGroupName === 'division_membership' && focused.name === 'division_name') {
		await respondWithDivisionAutocomplete({
			interaction,
			commandName,
			subcommandGroupName,
			subcommandName,
			focusedOptionName: focused.name
		});
		return;
	}

	await interaction.respond([]);
}

async function respondWithGuildMemberAutocomplete({
	interaction,
	commandName,
	subcommandGroupName,
	subcommandName,
	focusedOptionName
}: {
	interaction: Subcommand.AutocompleteInteraction;
	commandName: string;
	subcommandGroupName: string | null;
	subcommandName: string | null;
	focusedOptionName: string;
}) {
	const guild = await resolveAutocompleteGuild({
		interaction,
		loggerContext: {
			commandName,
			subcommandGroupName,
			subcommandName,
			focusedOptionName
		},
		logMessage: 'Failed to resolve configured guild during staff command autocomplete'
	});
	if (!guild) {
		return;
	}

	const query = String(interaction.options.getFocused()).trim().toLowerCase();
	const choices = await buildGuildMemberAutocompleteChoices({
		guild,
		query
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
			subcommandGroupName,
			subcommandName,
			focusedOptionName,
			query
		},
		logMessage: 'Failed to respond to staff command member autocomplete'
	});
}

async function respondWithDivisionAutocomplete({
	interaction,
	commandName,
	subcommandGroupName,
	subcommandName,
	focusedOptionName
}: {
	interaction: Subcommand.AutocompleteInteraction;
	commandName: string;
	subcommandGroupName: string | null;
	subcommandName: string | null;
	focusedOptionName: string;
}) {
	const query = String(interaction.options.getFocused()).trim().toLowerCase();
	const choices = await buildDivisionAutocompleteChoices({
		query
	}).catch(async () => {
		await interaction.respond([]);
		return null;
	});
	if (!choices) {
		return;
	}

	await respondWithAutocompleteChoices({
		interaction,
		choices,
		loggerContext: {
			commandName,
			subcommandGroupName,
			subcommandName,
			focusedOptionName,
			query
		},
		logMessage: 'Failed to respond to staff command division autocomplete'
	});
}
