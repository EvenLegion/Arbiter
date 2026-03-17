import type { Guild, GuildMember } from 'discord.js';

import { resolveAutocompleteGuild, resolveAutocompleteRequester, respondWithEmptyAutocompleteChoices } from '../../../discord/autocompleteResponder';
import { buildAutocompleteLoggerContext, getAutocompleteQuery, respondWithQueryAutocompleteChoices } from '../../../discord/autocompleteRouteHelpers';
import { resolveMeritAutocompleteScope } from './meritAccessPolicy';

type AutocompleteInteraction = Parameters<typeof resolveAutocompleteGuild>[0]['interaction'] & {
	user: {
		id: string;
	};
};

type MeritAutocompleteRequester = {
	member: GuildMember;
	isStaff: boolean;
};

type MeritAutocompleteLoggerContext = ReturnType<typeof buildAutocompleteLoggerContext>;

export async function resolveMeritStaffAutocompleteContext({
	interaction,
	loggerContext,
	logMessage
}: {
	interaction: AutocompleteInteraction;
	loggerContext: MeritAutocompleteLoggerContext;
	logMessage: string;
}): Promise<{ guild: Guild; requester: MeritAutocompleteRequester } | null> {
	const guild = await resolveAutocompleteGuild({
		interaction,
		loggerContext,
		logMessage
	});
	if (!guild) {
		return null;
	}

	const requester = await resolveAutocompleteRequester({
		guild,
		discordUserId: interaction.user.id
	});
	if (!requester || !requester.isStaff) {
		await respondWithEmptyAutocompleteChoices(interaction);
		return null;
	}

	return {
		guild,
		requester
	};
}

export async function resolveMeritMemberAutocompleteAccess({
	interaction,
	loggerContext,
	logMessage,
	forbidNonStaff = false
}: {
	interaction: AutocompleteInteraction;
	loggerContext: MeritAutocompleteLoggerContext;
	logMessage: string;
	forbidNonStaff?: boolean;
}): Promise<
	| {
			kind: 'staff';
			guild: Guild;
			requester: MeritAutocompleteRequester;
	  }
	| {
			kind: 'self-only';
			requester: MeritAutocompleteRequester;
	  }
	| null
> {
	const guild = await resolveAutocompleteGuild({
		interaction,
		loggerContext,
		logMessage
	});
	if (!guild) {
		return null;
	}

	const requester = await resolveAutocompleteRequester({
		guild,
		discordUserId: interaction.user.id
	});
	if (!requester) {
		await respondWithEmptyAutocompleteChoices(interaction);
		return null;
	}

	const scope = resolveMeritAutocompleteScope({
		isStaff: requester.isStaff,
		forbidNonStaff
	});
	if (scope === 'staff') {
		return {
			kind: 'staff',
			guild,
			requester
		};
	}
	if (scope === 'forbidden') {
		await respondWithEmptyAutocompleteChoices(interaction);
		return null;
	}

	return {
		kind: 'self-only',
		requester
	};
}

export function resolveMeritAutocompleteQuery(value: unknown) {
	return getAutocompleteQuery(value);
}

export async function respondWithRequesterSelfChoice({
	interaction,
	requester,
	loggerContext,
	logMessage
}: {
	interaction: AutocompleteInteraction;
	requester: MeritAutocompleteRequester;
	loggerContext: MeritAutocompleteLoggerContext;
	logMessage: string;
}) {
	await respondWithQueryAutocompleteChoices({
		interaction,
		loggerContext,
		choiceLogMessage: logMessage,
		loadChoices: async () => [
			{
				name: requester.member.displayName.slice(0, 100),
				value: requester.member.id
			}
		]
	});
}
