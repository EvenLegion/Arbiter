import type { Subcommand } from '@sapphire/plugin-subcommands';
import type { AutocompleteFocusedOption } from 'discord.js';

import type { ExecutionContext } from '../../logging/executionContext';
import { createAutocompleteExecutionContext } from '../../logging/ingressExecutionContext';
import { respondWithEmptyAutocompleteChoices } from './autocompleteHelpers';

export type AutocompleteRouteContext = {
	interaction: Subcommand.AutocompleteInteraction;
	context: ExecutionContext;
	commandName: string;
	subcommandGroupName: string | null;
	subcommandName: string | null;
	focused: AutocompleteFocusedOption;
};

export type AutocompleteRoute = {
	matches: (context: AutocompleteRouteContext) => boolean;
	run: (context: AutocompleteRouteContext) => Promise<void>;
};

export async function routeAutocompleteInteraction({
	interaction,
	commandName,
	routes,
	onError
}: {
	interaction: Subcommand.AutocompleteInteraction;
	commandName: string;
	routes: readonly AutocompleteRoute[];
	onError?: (params: { error: unknown; context: AutocompleteRouteContext }) => Promise<void> | void;
}) {
	const executionContext = createAutocompleteExecutionContext({
		interaction,
		commandName
	});
	const context: AutocompleteRouteContext = {
		interaction,
		context: executionContext,
		commandName,
		subcommandGroupName: getOptionalSubcommandGroup(interaction),
		subcommandName: getOptionalSubcommand(interaction),
		focused: interaction.options.getFocused(true) as AutocompleteFocusedOption
	};

	try {
		for (const route of routes) {
			if (!route.matches(context)) {
				continue;
			}

			await route.run(context);
			executionContext.logger.debug('discord.autocomplete.completed');
			return;
		}

		await respondWithEmptyAutocompleteChoices(interaction);
		executionContext.logger.debug('discord.autocomplete.completed');
	} catch (error) {
		await respondWithEmptyAutocompleteChoices(interaction);
		executionContext.logger.error(
			{
				err: error
			},
			'discord.autocomplete.failed'
		);
		await onError?.({
			error,
			context
		});
	}
}

function getOptionalSubcommandGroup(interaction: Subcommand.AutocompleteInteraction) {
	const options = interaction.options as {
		getSubcommandGroup?: (required?: boolean) => string | null;
	};

	return typeof options.getSubcommandGroup === 'function' ? options.getSubcommandGroup(false) : null;
}

function getOptionalSubcommand(interaction: Subcommand.AutocompleteInteraction) {
	const options = interaction.options as {
		getSubcommand?: (required?: boolean) => string | null;
	};

	return typeof options.getSubcommand === 'function' ? options.getSubcommand(false) : null;
}
