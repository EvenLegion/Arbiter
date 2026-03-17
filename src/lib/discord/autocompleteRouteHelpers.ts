import {
	respondWithAutocompleteChoices,
	respondWithEmptyAutocompleteChoices,
	resolveAutocompleteGuild,
	type AutocompleteChoice
} from './autocompleteResponder';

type AutocompleteInteraction = Parameters<typeof resolveAutocompleteGuild>[0]['interaction'];
type ResolvedAutocompleteGuild = NonNullable<Awaited<ReturnType<typeof resolveAutocompleteGuild>>>;

type BaseAutocompleteLoggerContext = {
	commandName: string;
	subcommandGroupName?: string | null;
	subcommandName?: string | null;
	focusedOptionName: string;
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

export async function respondWithQueryAutocompleteChoices({
	interaction,
	loggerContext,
	choiceLogMessage,
	loadChoices
}: {
	interaction: AutocompleteInteraction;
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
		loggerContext,
		logMessage: choiceLogMessage
	});
}

export async function respondWithGuildScopedAutocompleteChoices({
	interaction,
	guildLoggerContext,
	guildLogMessage,
	choiceLoggerContext,
	choiceLogMessage,
	loadChoices
}: {
	interaction: AutocompleteInteraction;
	guildLoggerContext: ReturnType<typeof buildAutocompleteLoggerContext>;
	guildLogMessage: string;
	choiceLoggerContext: ReturnType<typeof buildAutocompleteLoggerContext>;
	choiceLogMessage: string;
	loadChoices: (guild: ResolvedAutocompleteGuild) => Promise<AutocompleteChoice[]>;
}) {
	const guild = await resolveAutocompleteGuild({
		interaction,
		loggerContext: guildLoggerContext,
		logMessage: guildLogMessage
	});
	if (!guild) {
		return;
	}

	await respondWithQueryAutocompleteChoices({
		interaction,
		loggerContext: choiceLoggerContext,
		choiceLogMessage,
		loadChoices: () => loadChoices(guild)
	});
}
