import type { Subcommand } from '@sapphire/plugin-subcommands';

import { routeAutocompleteInteraction, type AutocompleteRoute } from '../../../discord/autocompleteRouter';
import { logAutocompleteError } from '../../../discord/autocompleteResponder';
import {
	buildAutocompleteLoggerContext,
	getAutocompleteQuery,
	respondWithGuildScopedAutocompleteChoices,
	respondWithQueryAutocompleteChoices
} from '../../../discord/autocompleteRouteHelpers';
import {
	buildEventSessionAutocompleteChoices,
	buildEventTierAutocompleteChoices,
	buildEventVoiceChannelAutocompleteChoices
} from './eventAutocompleteOptions';

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
	{
		matches: ({ subcommandName, focused }) => subcommandName === 'start' && focused.name === 'tier_level',
		run: async ({ interaction, context, commandName, subcommandName, focused }) => {
			const query = getAutocompleteQuery(focused.value);
			await respondWithQueryAutocompleteChoices({
				interaction,
				logger: context.logger,
				loggerContext: buildAutocompleteLoggerContext({
					commandName,
					subcommandName,
					focusedOptionName: focused.name,
					query
				}),
				choiceLogMessage: 'Failed to respond to event tier autocomplete',
				loadChoices: () =>
					buildEventTierAutocompleteChoices({
						query
					})
			});
		}
	},
	{
		matches: ({ subcommandName, focused }) => subcommandName === 'add_vc' && focused.name === 'event_selection',
		run: async ({ interaction, context, commandName, subcommandName, focused }) => {
			const query = getAutocompleteQuery(focused.value);
			await respondWithQueryAutocompleteChoices({
				interaction,
				logger: context.logger,
				loggerContext: buildAutocompleteLoggerContext({
					commandName,
					subcommandName,
					focusedOptionName: focused.name,
					query
				}),
				choiceLogMessage: 'Failed to respond to event session autocomplete',
				loadChoices: () =>
					buildEventSessionAutocompleteChoices({
						query
					})
			});
		}
	},
	{
		matches: ({ subcommandName, focused }) => subcommandName === 'add_vc' && focused.name === 'voice_channel',
		run: async ({ interaction, context, commandName, subcommandName, focused }) => {
			const query = getAutocompleteQuery(focused.value);
			await respondWithGuildScopedAutocompleteChoices({
				interaction,
				logger: context.logger,
				guildLoggerContext: buildAutocompleteLoggerContext({
					commandName,
					subcommandName,
					focusedOptionName: focused.name
				}),
				guildLogMessage: 'Failed to resolve configured guild during event command autocomplete',
				choiceLoggerContext: buildAutocompleteLoggerContext({
					commandName,
					subcommandName,
					focusedOptionName: focused.name,
					query
				}),
				choiceLogMessage: 'Failed to respond to event voice channel autocomplete',
				loadChoices: (guild) =>
					buildEventVoiceChannelAutocompleteChoices({
						guild,
						query
					})
			});
		}
	}
];
