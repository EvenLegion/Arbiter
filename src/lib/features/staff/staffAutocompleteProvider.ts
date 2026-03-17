import type { Subcommand } from '@sapphire/plugin-subcommands';

import { routeAutocompleteInteraction, type AutocompleteRoute } from '../../discord/autocompleteRouter';
import {
	buildAutocompleteLoggerContext,
	getAutocompleteQuery,
	respondWithGuildScopedAutocompleteChoices,
	respondWithQueryAutocompleteChoices
} from '../../discord/autocompleteRouteHelpers';
import { buildGuildMemberAutocompleteChoices } from '../../discord/memberDirectory';
import { buildDivisionAutocompleteChoices } from '../division-selection/divisionDirectory';

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
	{
		matches: ({ subcommandName, subcommandGroupName, focused }) =>
			(subcommandName === 'sync_nickname' && focused.name === 'user') ||
			(subcommandGroupName === 'division_membership' && focused.name === 'nickname'),
		run: async ({ interaction, context, commandName, subcommandGroupName, subcommandName, focused }) =>
			respondWithGuildMemberAutocomplete({
				interaction,
				logger: context.logger,
				commandName,
				subcommandGroupName,
				subcommandName,
				focusedOptionName: focused.name
			})
	},
	{
		matches: ({ subcommandGroupName, focused }) => subcommandGroupName === 'division_membership' && focused.name === 'division_name',
		run: async ({ interaction, context, commandName, subcommandGroupName, subcommandName, focused }) =>
			respondWithDivisionAutocomplete({
				interaction,
				logger: context.logger,
				commandName,
				subcommandGroupName,
				subcommandName,
				focusedOptionName: focused.name
			})
	}
];

async function respondWithGuildMemberAutocomplete({
	interaction,
	logger,
	commandName,
	subcommandGroupName,
	subcommandName,
	focusedOptionName
}: {
	interaction: Subcommand.AutocompleteInteraction;
	logger: Parameters<typeof respondWithGuildScopedAutocompleteChoices>[0]['logger'];
	commandName: string;
	subcommandGroupName: string | null;
	subcommandName: string | null;
	focusedOptionName: string;
}) {
	const query = getAutocompleteQuery(interaction.options.getFocused(), {
		lowercase: true
	});
	await respondWithGuildScopedAutocompleteChoices({
		interaction,
		logger,
		guildLoggerContext: buildAutocompleteLoggerContext({
			commandName,
			subcommandGroupName,
			subcommandName,
			focusedOptionName
		}),
		guildLogMessage: 'Failed to resolve configured guild during staff command autocomplete',
		choiceLoggerContext: buildAutocompleteLoggerContext({
			commandName,
			subcommandGroupName,
			subcommandName,
			focusedOptionName,
			query
		}),
		choiceLogMessage: 'Failed to respond to staff command member autocomplete',
		loadChoices: (guild) =>
			buildGuildMemberAutocompleteChoices({
				guild,
				query
			})
	});
}

async function respondWithDivisionAutocomplete({
	interaction,
	logger,
	commandName,
	subcommandGroupName,
	subcommandName,
	focusedOptionName
}: {
	interaction: Subcommand.AutocompleteInteraction;
	logger: Parameters<typeof respondWithQueryAutocompleteChoices>[0]['logger'];
	commandName: string;
	subcommandGroupName: string | null;
	subcommandName: string | null;
	focusedOptionName: string;
}) {
	const query = getAutocompleteQuery(interaction.options.getFocused(), {
		lowercase: true
	});
	await respondWithQueryAutocompleteChoices({
		interaction,
		logger,
		loggerContext: buildAutocompleteLoggerContext({
			commandName,
			subcommandGroupName,
			subcommandName,
			focusedOptionName,
			query
		}),
		choiceLogMessage: 'Failed to respond to staff command division autocomplete',
		loadChoices: () =>
			buildDivisionAutocompleteChoices({
				query
			})
	});
}
