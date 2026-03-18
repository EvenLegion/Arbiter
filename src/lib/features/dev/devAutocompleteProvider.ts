import type { Subcommand } from '@sapphire/plugin-subcommands';

import { routeAutocompleteInteraction, type AutocompleteRoute } from '../../discord/autocomplete/autocompleteRouter';
import { createGuildScopedAutocompleteRoute, getAutocompleteQuery } from '../../discord/autocomplete/autocompleteHelpers';
import { buildGuildMemberAutocompleteChoices } from '../../discord/members/memberDirectory';

type HandleDevAutocompleteParams = {
	interaction: Subcommand.AutocompleteInteraction;
	commandName?: string;
};

export async function handleDevAutocomplete({ interaction, commandName = 'dev' }: HandleDevAutocompleteParams) {
	await routeAutocompleteInteraction({
		interaction,
		commandName,
		routes: DEV_AUTOCOMPLETE_ROUTES
	});
}

const DEV_AUTOCOMPLETE_ROUTES: readonly AutocompleteRoute[] = [
	createGuildScopedAutocompleteRoute({
		match: {
			subcommandGroupName: 'nickname',
			focusedOptionName: 'user'
		},
		guildLogMessage: 'Failed to resolve configured guild during dev command autocomplete',
		choiceLogMessage: 'Failed to respond to dev command autocomplete',
		resolveQuery: (value) =>
			getAutocompleteQuery(value, {
				lowercase: true
			}),
		loadChoices: ({ guild, query }) =>
			buildGuildMemberAutocompleteChoices({
				guild,
				query
			})
	})
];
