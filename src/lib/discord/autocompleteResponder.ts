import { container } from '@sapphire/framework';
import type { Guild } from 'discord.js';

type AutocompleteInteraction = {
	respond: (choices: { name: string; value: string }[]) => Promise<unknown>;
};

export async function resolveAutocompleteGuild({
	interaction,
	loggerContext,
	logMessage
}: {
	interaction: AutocompleteInteraction;
	loggerContext: Record<string, unknown>;
	logMessage: string;
}): Promise<Guild | null> {
	return container.utilities.guild.getOrThrow().catch(async (error: unknown) => {
		container.logger.error(
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
	loggerContext,
	logMessage
}: {
	interaction: AutocompleteInteraction;
	choices: { name: string; value: string }[];
	loggerContext: Record<string, unknown>;
	logMessage: string;
}) {
	await interaction.respond(choices).catch(async (error: unknown) => {
		container.logger.error(
			{
				err: error,
				...loggerContext
			},
			logMessage
		);
		await interaction.respond([]);
	});
}
