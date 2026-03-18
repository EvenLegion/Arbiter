import type { Subcommand } from '@sapphire/plugin-subcommands';

import { routeAutocompleteInteraction, type AutocompleteRoute } from '../../../../discord/autocomplete/autocompleteRouter';
import {
	createGuildScopedAutocompleteRoute,
	createQueryAutocompleteRoute,
	logAutocompleteError
} from '../../../../discord/autocomplete/autocompleteHelpers';
import {
	buildEventSessionAutocompleteChoices,
	buildEventTierAutocompleteChoices,
	buildEventVoiceChannelAutocompleteChoices
} from './eventAutocompleteChoices';

type HandleEventAutocompleteParams = {
	interaction: Subcommand.AutocompleteInteraction;
	commandName?: string;
};

export async function handleEventAutocomplete({ interaction, commandName = 'event' }: HandleEventAutocompleteParams) {
	await routeAutocompleteInteraction({
		interaction,
		commandName,
		routes: EVENT_AUTOCOMPLETE_ROUTES,
		onError: ({ error, context }) =>
			logAutocompleteError({
				error,
				logger: context.context.logger,
				loggerContext: {
					commandName: context.commandName,
					subcommandGroupName: context.subcommandGroupName,
					subcommandName: context.subcommandName,
					focusedOptionName: context.focused.name
				},
				logMessage: 'Encountered error in event command autocomplete'
			})
	});
}

const EVENT_AUTOCOMPLETE_ROUTES: readonly AutocompleteRoute[] = [
	createQueryAutocompleteRoute({
		match: {
			subcommandName: 'start',
			focusedOptionName: 'tier_level'
		},
		choiceLogMessage: 'Failed to respond to event tier autocomplete',
		loadChoices: ({ query }) =>
			buildEventTierAutocompleteChoices({
				query
			})
	}),
	createQueryAutocompleteRoute({
		match: {
			subcommandName: 'add_vc',
			focusedOptionName: 'event_selection'
		},
		choiceLogMessage: 'Failed to respond to event session autocomplete',
		loadChoices: ({ query }) =>
			buildEventSessionAutocompleteChoices({
				query
			})
	}),
	createGuildScopedAutocompleteRoute({
		match: {
			subcommandName: 'add_vc',
			focusedOptionName: 'voice_channel'
		},
		guildLogMessage: 'Failed to resolve configured guild during event command autocomplete',
		choiceLogMessage: 'Failed to respond to event voice channel autocomplete',
		loadChoices: ({ guild, query }) =>
			buildEventVoiceChannelAutocompleteChoices({
				guild,
				query
			})
	})
];
