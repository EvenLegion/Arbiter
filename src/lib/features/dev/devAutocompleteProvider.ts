import type { Subcommand } from '@sapphire/plugin-subcommands';

import { resolveAutocompleteGuild, respondWithAutocompleteChoices } from '../../discord/autocompleteResponder';
import { buildGuildMemberAutocompleteChoices } from '../../discord/memberDirectory';

type HandleDevAutocompleteParams = {
	interaction: Subcommand.AutocompleteInteraction;
	commandName?: string;
};

export async function handleDevAutocomplete({ interaction, commandName = 'dev' }: HandleDevAutocompleteParams) {
	const subcommandGroupName = interaction.options.getSubcommandGroup(false);
	const focused = interaction.options.getFocused(true);
	if (subcommandGroupName !== 'nickname' || focused.name !== 'user') {
		await interaction.respond([]);
		return;
	}

	const guild = await resolveAutocompleteGuild({
		interaction,
		loggerContext: {
			commandName,
			subcommandGroupName,
			focusedOptionName: focused.name
		},
		logMessage: 'Failed to resolve configured guild during dev command autocomplete'
	});
	if (!guild) {
		return;
	}

	const query = String(focused.value).trim().toLowerCase();
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
			focusedOptionName: focused.name,
			query
		},
		logMessage: 'Failed to respond to dev command autocomplete'
	});
}
