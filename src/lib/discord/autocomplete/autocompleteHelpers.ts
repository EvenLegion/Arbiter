import type { Guild, GuildMember } from 'discord.js';

import type { ContextLogger } from '../../logging/executionContext';
import { resolveActorCoreWithDeps } from '../actor/actorResolver';
import { memberHasDivisionKindRole } from '../guild/divisions';
import { getConfiguredGuild } from '../guild/configuredGuild';
import { getGuildMemberOrThrow } from '../guild/guildMembers';
import type { AutocompleteRoute, AutocompleteRouteContext } from './autocompleteRouter';

export type AutocompleteChoice = {
	name: string;
	value: string;
};

type AutocompleteInteraction = {
	respond: (choices: { name: string; value: string }[]) => Promise<unknown>;
};

type ResolvedAutocompleteGuild = NonNullable<Awaited<ReturnType<typeof resolveAutocompleteGuild>>>;

type BaseAutocompleteLoggerContext = {
	commandName: string;
	subcommandGroupName?: string | null;
	subcommandName?: string | null;
	focusedOptionName: string;
};

type AutocompleteRouteMatch = {
	subcommandGroupName?: string | readonly string[] | null;
	subcommandName?: string | readonly string[] | null;
	focusedOptionName: string | readonly string[];
};

export function buildAutocompleteLoggerContext(
	context: BaseAutocompleteLoggerContext & {
		query?: string;
	}
) {
	return {
		commandName: context.commandName,
		...(context.subcommandGroupName !== undefined ? { subcommandGroupName: context.subcommandGroupName } : {}),
		...(context.subcommandName !== undefined ? { subcommandName: context.subcommandName } : {}),
		focusedOptionName: context.focusedOptionName,
		...(context.query !== undefined ? { query: context.query } : {})
	};
}

export function getAutocompleteQuery(value: unknown, { lowercase = false }: { lowercase?: boolean } = {}) {
	const query = String(value).trim();
	return lowercase ? query.toLowerCase() : query;
}

export async function resolveAutocompleteGuild({
	interaction,
	logger,
	loggerContext,
	logMessage
}: {
	interaction: AutocompleteInteraction;
	logger?: ContextLogger;
	loggerContext: Record<string, unknown>;
	logMessage: string;
}): Promise<Guild | null> {
	return getConfiguredGuild().catch(async (error: unknown) => {
		logger?.error(
			{
				err: error,
				...loggerContext
			},
			logMessage
		);
		await interaction.respond([]);
		return null;
	});
}

export async function respondWithAutocompleteChoices({
	interaction,
	choices,
	logger,
	loggerContext,
	logMessage
}: {
	interaction: AutocompleteInteraction;
	choices: AutocompleteChoice[];
	logger?: ContextLogger;
	loggerContext: Record<string, unknown>;
	logMessage: string;
}) {
	await interaction.respond(choices).catch(async (error: unknown) => {
		logger?.error(
			{
				err: error,
				...loggerContext
			},
			logMessage
		);
		await interaction.respond([]);
	});
}

export async function respondWithEmptyAutocompleteChoices(interaction: AutocompleteInteraction) {
	await interaction.respond([]).catch(() => undefined);
}

export function logAutocompleteError({
	error,
	logger,
	loggerContext,
	logMessage
}: {
	error: unknown;
	logger?: ContextLogger;
	loggerContext: Record<string, unknown>;
	logMessage: string;
}) {
	logger?.error(
		{
			err: error,
			...loggerContext
		},
		logMessage
	);
}

export async function resolveAutocompleteRequester({ guild, discordUserId }: { guild: Guild; discordUserId: string }): Promise<{
	member: GuildMember;
	isStaff: boolean;
} | null> {
	const resolved = await resolveActorCoreWithDeps(
		{
			getMember: getGuildMemberOrThrow,
			hasDivisionKindRole: memberHasDivisionKindRole,
			hasDivision: async () => false,
			centurionRoleId: ''
		},
		{
			guild,
			discordUserId
		}
	);
	if (resolved.kind !== 'ok') {
		return null;
	}

	return {
		member: resolved.member,
		isStaff: resolved.capabilities.isStaff
	};
}

export async function respondWithQueryAutocompleteChoices({
	interaction,
	logger,
	loggerContext,
	choiceLogMessage,
	loadChoices
}: {
	interaction: AutocompleteInteraction;
	logger: ContextLogger;
	loggerContext: ReturnType<typeof buildAutocompleteLoggerContext>;
	choiceLogMessage: string;
	loadChoices: () => Promise<AutocompleteChoice[]>;
}) {
	const choices = await loadChoices().catch(() => null);
	if (!choices) {
		await respondWithEmptyAutocompleteChoices(interaction);
		return;
	}

	await respondWithAutocompleteChoices({
		interaction,
		choices,
		logger,
		loggerContext,
		logMessage: choiceLogMessage
	});
}

export async function respondWithGuildScopedAutocompleteChoices({
	interaction,
	logger,
	guildLoggerContext,
	guildLogMessage,
	choiceLoggerContext,
	choiceLogMessage,
	loadChoices
}: {
	interaction: AutocompleteInteraction;
	logger: ContextLogger;
	guildLoggerContext: ReturnType<typeof buildAutocompleteLoggerContext>;
	guildLogMessage: string;
	choiceLoggerContext: ReturnType<typeof buildAutocompleteLoggerContext>;
	choiceLogMessage: string;
	loadChoices: (guild: ResolvedAutocompleteGuild) => Promise<AutocompleteChoice[]>;
}) {
	const guild = await resolveAutocompleteGuild({
		interaction,
		logger,
		loggerContext: guildLoggerContext,
		logMessage: guildLogMessage
	});
	if (!guild) {
		return;
	}

	await respondWithQueryAutocompleteChoices({
		interaction,
		logger,
		loggerContext: choiceLoggerContext,
		choiceLogMessage,
		loadChoices: () => loadChoices(guild)
	});
}

export function createQueryAutocompleteRoute({
	match,
	choiceLogMessage,
	resolveQuery = (value: unknown) => getAutocompleteQuery(value),
	loadChoices
}: {
	match: AutocompleteRouteMatch;
	choiceLogMessage: string;
	resolveQuery?: (value: unknown) => string;
	loadChoices: (params: { query: string; route: AutocompleteRouteContext }) => Promise<AutocompleteChoice[]>;
}): AutocompleteRoute {
	return {
		matches: (context) => matchesAutocompleteRoute(context, match),
		run: async (route) => {
			const query = resolveQuery(route.focused.value);
			await respondWithQueryAutocompleteChoices({
				interaction: route.interaction,
				logger: route.context.logger,
				loggerContext: buildRouteLoggerContext(route, query),
				choiceLogMessage,
				loadChoices: () =>
					loadChoices({
						query,
						route
					})
			});
		}
	};
}

export function createGuildScopedAutocompleteRoute({
	match,
	guildLogMessage,
	choiceLogMessage,
	resolveQuery = (value: unknown) => getAutocompleteQuery(value),
	loadChoices
}: {
	match: AutocompleteRouteMatch;
	guildLogMessage: string;
	choiceLogMessage: string;
	resolveQuery?: (value: unknown) => string;
	loadChoices: (params: { guild: ResolvedAutocompleteGuild; query: string; route: AutocompleteRouteContext }) => Promise<AutocompleteChoice[]>;
}): AutocompleteRoute {
	return {
		matches: (context) => matchesAutocompleteRoute(context, match),
		run: async (route) => {
			const query = resolveQuery(route.focused.value);
			await respondWithGuildScopedAutocompleteChoices({
				interaction: route.interaction,
				logger: route.context.logger,
				guildLoggerContext: buildRouteLoggerContext(route),
				guildLogMessage,
				choiceLoggerContext: buildRouteLoggerContext(route, query),
				choiceLogMessage,
				loadChoices: (guild) =>
					loadChoices({
						guild,
						query,
						route
					})
			});
		}
	};
}

function matchesAutocompleteRoute(
	context: AutocompleteRouteContext,
	{ subcommandGroupName, subcommandName, focusedOptionName }: AutocompleteRouteMatch
) {
	return (
		matchesAutocompleteValue(context.subcommandGroupName, subcommandGroupName) &&
		matchesAutocompleteValue(context.subcommandName, subcommandName) &&
		matchesAutocompleteValue(context.focused.name, focusedOptionName)
	);
}

function matchesAutocompleteValue(actual: string | null, expected?: string | readonly string[] | null) {
	if (expected === undefined) {
		return true;
	}

	if (expected === null) {
		return actual === null;
	}

	return Array.isArray(expected) ? expected.includes(actual ?? '') : actual === expected;
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
