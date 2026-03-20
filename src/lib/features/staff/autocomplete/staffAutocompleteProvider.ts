import type { Subcommand } from '@sapphire/plugin-subcommands';

import { routeAutocompleteInteraction, type AutocompleteRoute } from '../../../discord/autocomplete/autocompleteRouter';
import {
	createGuildScopedAutocompleteRoute,
	createQueryAutocompleteRoute,
	getAutocompleteQuery
} from '../../../discord/autocomplete/autocompleteHelpers';
import { buildGuildMemberAutocompleteChoices } from '../../../discord/members/memberDirectory';
import { buildDivisionAutocompleteChoices } from '../../../services/division-membership/divisionDirectory';

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
