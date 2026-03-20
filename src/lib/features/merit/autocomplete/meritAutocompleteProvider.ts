import type { Subcommand } from '@sapphire/plugin-subcommands';

import type { AutocompleteRoute, AutocompleteRouteContext } from '../../../discord/autocomplete/autocompleteRouter';
import {
	buildAutocompleteLoggerContext,
	getAutocompleteQuery,
	resolveAutocompleteGuild,
	resolveAutocompleteRequester,
	respondWithEmptyAutocompleteChoices,
	respondWithQueryAutocompleteChoices
} from '../../../discord/autocomplete/autocompleteHelpers';
import { routeAutocompleteInteraction } from '../../../discord/autocomplete/autocompleteRouter';
import { buildManualMeritTypeChoices, buildMeritExistingEventChoices, buildMeritMemberChoices } from './meritAutocompleteChoices';

type HandleMeritAutocompleteParams = {
	interaction: Subcommand.AutocompleteInteraction;
	commandName?: string;
};

const MERIT_AUTOCOMPLETE_ROUTES: readonly AutocompleteRoute[] = [
	{
		matches: ({ subcommandName, focused }) => subcommandName === 'give' && focused.name === 'existing_event',
		run: (route) =>
			handleStaffQueryAutocomplete({
				route,
				choiceLogMessage: 'Failed to respond to merit existing_event autocomplete',
				loadChoices: ({ query }) =>
					buildMeritExistingEventChoices({
						query
					})
			})
	},
	{
		matches: ({ subcommandName, focused }) => subcommandName === 'give' && focused.name === 'merit_type',
		run: (route) =>
			handleStaffQueryAutocomplete({
				route,
				choiceLogMessage: 'Failed to respond to merit merit_type autocomplete',
				loadChoices: ({ query }) =>
					buildManualMeritTypeChoices({
						query
					})
			})
	},
	{
		matches: ({ subcommandName, focused }) =>
			(subcommandName === 'give' || subcommandName === 'list') && (focused.name === 'player_name' || focused.name === 'user_name'),
		run: handleMemberAutocomplete
	}
];

export async function handleMeritAutocomplete({ interaction, commandName = 'merit' }: HandleMeritAutocompleteParams) {
	await routeAutocompleteInteraction({
		interaction,
		commandName,
		routes: MERIT_AUTOCOMPLETE_ROUTES
	});
}

async function handleStaffQueryAutocomplete({
	route,
	choiceLogMessage,
	loadChoices
}: {
	route: AutocompleteRouteContext;
	choiceLogMessage: string;
	loadChoices: (params: { query: string }) => Promise<Array<{ name: string; value: string }>>;
}) {
	const resolved = await resolveStaffRequester({
		route,
		logMessage: 'Failed to resolve configured guild during merit command autocomplete'
	});
	if (!resolved) {
		return;
	}

	const query = getAutocompleteQuery(route.focused.value);
	await respondWithQueryAutocompleteChoices({
		interaction: route.interaction,
		logger: route.context.logger,
		loggerContext: buildRouteLoggerContext(route, query),
		choiceLogMessage,
		loadChoices: () =>
			loadChoices({
				query
			})
	});
}

async function handleMemberAutocomplete(route: AutocompleteRouteContext) {
	if (route.subcommandName !== 'give' && route.subcommandName !== 'list') {
		await respondWithEmptyAutocompleteChoices(route.interaction);
		return;
	}

	const access = await resolveMemberAutocompleteAccess({
		route,
		logMessage: 'Failed to resolve configured guild during merit command autocomplete',
		forbidNonStaff: route.subcommandName === 'give'
	});
	if (!access) {
		return;
	}

	if (access.kind === 'self-only') {
		await respondWithQueryAutocompleteChoices({
			interaction: route.interaction,
			logger: route.context.logger,
			loggerContext: buildRouteLoggerContext(route),
			choiceLogMessage: 'Failed to respond to merit self autocomplete',
			loadChoices: async () => [
				{
					name: access.requester.member.displayName.slice(0, 100),
					value: access.requester.member.id
				}
			]
		});
		return;
	}

	const query = getAutocompleteQuery(route.focused.value);
	await respondWithQueryAutocompleteChoices({
		interaction: route.interaction,
		logger: route.context.logger,
		loggerContext: buildRouteLoggerContext(route, query),
		choiceLogMessage: 'Failed to respond to merit member autocomplete',
		loadChoices: () =>
			buildMeritMemberChoices({
				guild: access.guild,
				query
			})
	});
}

async function resolveStaffRequester({ route, logMessage }: { route: AutocompleteRouteContext; logMessage: string }) {
	const guild = await resolveAutocompleteGuild({
		interaction: route.interaction,
		logger: route.context.logger,
		loggerContext: buildRouteLoggerContext(route),
		logMessage
	});
	if (!guild) {
		return null;
	}

	const requester = await resolveAutocompleteRequester({
		guild,
		discordUserId: route.interaction.user.id
	});
	if (!requester || !requester.isStaff) {
		await respondWithEmptyAutocompleteChoices(route.interaction);
		return null;
	}

	return {
		guild,
		requester
	};
}

async function resolveMemberAutocompleteAccess({
	route,
	logMessage,
	forbidNonStaff
}: {
	route: AutocompleteRouteContext;
	logMessage: string;
	forbidNonStaff: boolean;
}): Promise<
	| {
			kind: 'staff';
			guild: NonNullable<Awaited<ReturnType<typeof resolveAutocompleteGuild>>>;
			requester: NonNullable<Awaited<ReturnType<typeof resolveAutocompleteRequester>>>;
	  }
	| {
			kind: 'self-only';
			requester: NonNullable<Awaited<ReturnType<typeof resolveAutocompleteRequester>>>;
	  }
	| null
> {
	const guild = await resolveAutocompleteGuild({
		interaction: route.interaction,
		logger: route.context.logger,
		loggerContext: buildRouteLoggerContext(route),
		logMessage
	});
	if (!guild) {
		return null;
	}

	const requester = await resolveAutocompleteRequester({
		guild,
		discordUserId: route.interaction.user.id
	});
	if (!requester) {
		await respondWithEmptyAutocompleteChoices(route.interaction);
		return null;
	}

	if (requester.isStaff) {
		return {
			kind: 'staff',
			guild,
			requester
		};
	}

	if (forbidNonStaff) {
		await respondWithEmptyAutocompleteChoices(route.interaction);
		return null;
	}

	return {
		kind: 'self-only',
		requester
	};
}

function buildRouteLoggerContext(route: AutocompleteRouteContext, query?: string) {
	return buildAutocompleteLoggerContext({
		commandName: route.commandName,
		subcommandGroupName: route.subcommandGroupName,
		subcommandName: route.subcommandName,
		focusedOptionName: route.focused.name,
		...(query !== undefined ? { query } : {})
	});
}
