import type { Guild, GuildMember } from 'discord.js';

import { resolveActorCoreWithDeps } from './actorCapabilityResolver';
import type { ContextLogger } from '../logging/executionContext';
import { memberHasDivisionKindRole } from './divisionPolicyGateway';
import { getConfiguredGuild } from './configuredGuildGateway';
import { getGuildMemberOrThrow } from './guildMemberGateway';

export type AutocompleteChoice = {
	name: string;
	value: string;
};

type AutocompleteInteraction = {
	respond: (choices: { name: string; value: string }[]) => Promise<unknown>;
};

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
