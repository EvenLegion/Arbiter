import type { Subcommand } from '@sapphire/plugin-subcommands';

import { routeAutocompleteInteraction, type AutocompleteRoute } from '../../../discord/autocomplete/autocompleteRouter';
import {
	createGuildScopedAutocompleteRoute,
	createQueryAutocompleteRoute,
	getAutocompleteQuery
} from '../../../discord/autocomplete/autocompleteHelpers';
import { buildGuildMemberAutocompleteChoices } from '../../../discord/members/memberDirectory';
import { buildDivisionAutocompleteChoices } from '../../../services/division-membership/divisionDirectory';
import {
	buildEventAttendeeAutocompleteChoices,
	buildMedalEventAutocompleteChoices,
	buildMedalRoleAutocompleteChoices,
	buildStandaloneMedalEligibleUserChoices
} from '../medal/staffMedalAutocompleteChoices';

type HandleStaffAutocompleteParams = {
	interaction: Subcommand.AutocompleteInteraction;
	commandName?: string;
};

export async function handleStaffAutocomplete({ interaction, commandName = 'staff' }: HandleStaffAutocompleteParams) {
	await routeAutocompleteInteraction({
		interaction,
		commandName,
		routes: STAFF_AUTOCOMPLETE_ROUTES
	});
}

const STAFF_AUTOCOMPLETE_ROUTES: readonly AutocompleteRoute[] = [
	createGuildMemberRoute({
		subcommandName: 'sync_nickname',
		focusedOptionName: 'user'
	}),
	createGuildMemberRoute({
		subcommandGroupName: 'division_membership',
		focusedOptionName: 'nickname'
	}),
	createGuildScopedAutocompleteRoute({
		match: {
			subcommandName: 'medal-give',
			focusedOptionName: 'medal_name'
		},
		guildLogMessage: 'Failed to resolve configured guild during staff medal role autocomplete',
		choiceLogMessage: 'Failed to respond to staff medal role autocomplete',
		resolveQuery: (value) =>
			getAutocompleteQuery(value, {
				lowercase: true
			}),
		loadChoices: ({ guild, query }) =>
			buildMedalRoleAutocompleteChoices({
				guild,
				query
			})
	}),
	createQueryAutocompleteRoute({
		match: {
			subcommandName: 'medal-give',
			focusedOptionName: 'event_name'
		},
		choiceLogMessage: 'Failed to respond to staff medal event autocomplete',
		resolveQuery: (value) =>
			getAutocompleteQuery(value, {
				lowercase: true
			}),
		loadChoices: ({ query }) =>
			buildMedalEventAutocompleteChoices({
				query
			})
	}),
	createQueryAutocompleteRoute({
		match: {
			subcommandName: 'medal-give',
			focusedOptionName: 'user_name'
		},
		choiceLogMessage: 'Failed to respond to staff medal user autocomplete',
		resolveQuery: (value) =>
			getAutocompleteQuery(value, {
				lowercase: true
			}),
		loadChoices: async ({ query, route }) => {
			const rawEventSelection = route.interaction.options.getString('event_name', false);
			const parsedEventSessionId = rawEventSelection ? Number(rawEventSelection) : null;

			if (rawEventSelection && Number.isInteger(parsedEventSessionId) && parsedEventSessionId! > 0) {
				return buildEventAttendeeAutocompleteChoices({
					eventSessionId: parsedEventSessionId!,
					query
				});
			}

			return buildStandaloneMedalEligibleUserChoices({
				query
			});
		}
	}),
	createQueryAutocompleteRoute({
		match: {
			subcommandGroupName: 'division_membership',
			focusedOptionName: 'division_name'
		},
		choiceLogMessage: 'Failed to respond to staff command division autocomplete',
		resolveQuery: (value) =>
			getAutocompleteQuery(value, {
				lowercase: true
			}),
		loadChoices: ({ query }) =>
			buildDivisionAutocompleteChoices({
				query
			})
	})
];

function createGuildMemberRoute({
	subcommandGroupName,
	subcommandName,
	focusedOptionName
}: {
	subcommandGroupName?: string;
	subcommandName?: string;
	focusedOptionName: string;
}) {
	return createGuildScopedAutocompleteRoute({
		match: {
			...(subcommandGroupName ? { subcommandGroupName } : {}),
			...(subcommandName ? { subcommandName } : {}),
			focusedOptionName
		},
		guildLogMessage: 'Failed to resolve configured guild during staff command autocomplete',
		choiceLogMessage: 'Failed to respond to staff command member autocomplete',
		resolveQuery: (value) =>
			getAutocompleteQuery(value, {
				lowercase: true
			}),
		loadChoices: ({ guild, query }) =>
			buildGuildMemberAutocompleteChoices({
				guild,
				query
			})
	});
}
