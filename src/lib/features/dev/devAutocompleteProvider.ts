import type { Subcommand } from '@sapphire/plugin-subcommands';

import { routeAutocompleteInteraction, type AutocompleteRoute } from '../../discord/autocompleteRouter';
import {
	buildAutocompleteLoggerContext,
	getAutocompleteQuery,
	respondWithGuildScopedAutocompleteChoices
} from '../../discord/autocompleteRouteHelpers';
import { buildGuildMemberAutocompleteChoices } from '../../discord/memberDirectory';

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
	{
		matches: ({ subcommandGroupName, focused }) => subcommandGroupName === 'nickname' && focused.name === 'user',
		run: async ({ interaction, commandName, subcommandGroupName, focused }) => {
			const query = getAutocompleteQuery(focused.value, {
				lowercase: true
			});
			await respondWithGuildScopedAutocompleteChoices({
				interaction,
				guildLoggerContext: buildAutocompleteLoggerContext({
					commandName,
					subcommandGroupName,
					focusedOptionName: focused.name
				}),
				guildLogMessage: 'Failed to resolve configured guild during dev command autocomplete',
				choiceLoggerContext: buildAutocompleteLoggerContext({
					commandName,
					subcommandGroupName,
					focusedOptionName: focused.name,
					query
				}),
				choiceLogMessage: 'Failed to respond to dev command autocomplete',
				loadChoices: (guild) =>
					buildGuildMemberAutocompleteChoices({
						guild,
						query
					})
			});
		}
	}
];
