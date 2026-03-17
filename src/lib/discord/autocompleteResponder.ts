import type { Guild, GuildMember } from 'discord.js';

import { getRuntimeLogger } from '../../integrations/sapphire/runtimeGateway';
import { resolveActorCoreWithDeps } from './actorCapabilityResolver';
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
	loggerContext,
	logMessage
}: {
	interaction: AutocompleteInteraction;
	loggerContext: Record<string, unknown>;
	logMessage: string;
}): Promise<Guild | null> {
	const logger = getRuntimeLogger();
	return getConfiguredGuild().catch(async (error: unknown) => {
		logger.error(
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
	choices: AutocompleteChoice[];
	loggerContext: Record<string, unknown>;
	logMessage: string;
}) {
	const logger = getRuntimeLogger();
	await interaction.respond(choices).catch(async (error: unknown) => {
		logger.error(
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
	loggerContext,
	logMessage
}: {
	error: unknown;
	loggerContext: Record<string, unknown>;
	logMessage: string;
}) {
	getRuntimeLogger().error(
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
