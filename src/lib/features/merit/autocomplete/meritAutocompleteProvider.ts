import type { Subcommand } from '@sapphire/plugin-subcommands';

import { routeAutocompleteInteraction } from '../../../discord/autocompleteRouter';
import { MERIT_AUTOCOMPLETE_ROUTES } from './meritAutocompleteRoutes';

type HandleMeritAutocompleteParams = {
	interaction: Subcommand.AutocompleteInteraction;
	commandName?: string;
};

export async function handleMeritAutocomplete({ interaction, commandName = 'merit' }: HandleMeritAutocompleteParams) {
	await routeAutocompleteInteraction({
		interaction,
		commandName,
		routes: MERIT_AUTOCOMPLETE_ROUTES
	});
}
