import type { AutocompleteRoute } from '../../../discord/autocompleteRouter';
import { respondWithEmptyAutocompleteChoices } from '../../../discord/autocompleteResponder';
import { buildAutocompleteLoggerContext, respondWithQueryAutocompleteChoices } from '../../../discord/autocompleteRouteHelpers';
import {
	resolveMeritAutocompleteQuery,
	resolveMeritMemberAutocompleteAccess,
	resolveMeritStaffAutocompleteContext,
	respondWithRequesterSelfChoice
} from './meritAutocompleteGuard';
import { buildManualMeritTypeChoices, buildMeritExistingEventChoices, buildMeritMemberChoices } from './meritAutocompleteChoices';

export const MERIT_AUTOCOMPLETE_ROUTES: readonly AutocompleteRoute[] = [
	createStaffQueryRoute({
		subcommandName: 'give',
		focusedOptionName: 'existing_event',
		choiceLogMessage: 'Failed to respond to merit existing_event autocomplete',
		loadChoices: ({ query }) =>
			buildMeritExistingEventChoices({
				query
			})
	}),
	createStaffQueryRoute({
		subcommandName: 'give',
		focusedOptionName: 'merit_type',
		choiceLogMessage: 'Failed to respond to merit merit_type autocomplete',
		loadChoices: ({ query }) =>
			buildManualMeritTypeChoices({
				query
			})
	}),
	createMemberRoute({
		subcommandNames: ['give', 'list'],
		focusedOptionNames: ['player_name', 'user_name'],
		choiceLogMessage: 'Failed to respond to merit member autocomplete',
		selfChoiceLogMessage: 'Failed to respond to merit self autocomplete'
	})
];

function createStaffQueryRoute({
	subcommandName,
	focusedOptionName,
	choiceLogMessage,
	loadChoices
}: {
	subcommandName: 'give' | 'list';
	focusedOptionName: string;
	choiceLogMessage: string;
	loadChoices: (params: { query: string }) => Promise<Array<{ name: string; value: string }>>;
}): AutocompleteRoute {
	return {
		matches: ({ subcommandName: currentSubcommandName, focused }) =>
			currentSubcommandName === subcommandName && focused.name === focusedOptionName,
		run: async ({ interaction, commandName, subcommandName: currentSubcommandName, focused }) => {
			const resolved = await resolveMeritStaffAutocompleteContext({
				interaction,
				loggerContext: {
					commandName,
					subcommandName: currentSubcommandName,
					focusedOptionName
				},
				logMessage: 'Failed to resolve configured guild during merit command autocomplete'
			});
			if (!resolved) {
				return;
			}

			const query = resolveMeritAutocompleteQuery(focused.value);
			await respondWithQueryAutocompleteChoices({
				interaction,
				loggerContext: buildAutocompleteLoggerContext({
					commandName,
					subcommandName: currentSubcommandName,
					focusedOptionName,
					query
				}),
				choiceLogMessage,
				loadChoices: () =>
					loadChoices({
						query
					})
			});
		}
	};
}

function createMemberRoute({
	subcommandNames,
	focusedOptionNames,
	choiceLogMessage,
	selfChoiceLogMessage
}: {
	subcommandNames: readonly ('give' | 'list')[];
	focusedOptionNames: readonly string[];
	choiceLogMessage: string;
	selfChoiceLogMessage: string;
}): AutocompleteRoute {
	return {
		matches: ({ subcommandName, focused }) =>
			typeof subcommandName === 'string' &&
			subcommandNames.includes(subcommandName as 'give' | 'list') &&
			focusedOptionNames.includes(focused.name),
		run: async ({ interaction, commandName, subcommandName, focused }) => {
			if (subcommandName !== 'give' && subcommandName !== 'list') {
				await respondWithEmptyAutocompleteChoices(interaction);
				return;
			}

			const access = await resolveMeritMemberAutocompleteAccess({
				interaction,
				loggerContext: {
					commandName,
					subcommandName,
					focusedOptionName: focused.name
				},
				logMessage: 'Failed to resolve configured guild during merit command autocomplete',
				forbidNonStaff: subcommandName === 'give'
			});
			if (!access) {
				return;
			}

			if (access.kind === 'self-only') {
				await respondWithRequesterSelfChoice({
					interaction,
					requester: access.requester,
					loggerContext: buildAutocompleteLoggerContext({
						commandName,
						subcommandName,
						focusedOptionName: focused.name
					}),
					logMessage: selfChoiceLogMessage
				});
				return;
			}

			await respondWithQueryAutocompleteChoices({
				interaction,
				loggerContext: buildAutocompleteLoggerContext({
					commandName,
					subcommandName,
					focusedOptionName: focused.name,
					query: resolveMeritAutocompleteQuery(focused.value)
				}),
				choiceLogMessage,
				loadChoices: () =>
					buildMeritMemberChoices({
						guild: access.guild,
						query: resolveMeritAutocompleteQuery(focused.value)
					})
			});
		}
	};
}
