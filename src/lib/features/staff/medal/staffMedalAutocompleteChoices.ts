import type { Guild, Role } from 'discord.js';

import { meritRepository, staffMedalRepository } from '../../../../integrations/prisma/repositories';
import { buildUserNickname, isNicknameTooLongError } from '../../../services/nickname/buildUserNickname';
import { MEDAL_ROLE_PREFIX, SEVEN_DAYS_IN_MS } from './staffMedalConstants';

const DEFAULT_AUTOCOMPLETE_LIMIT = 25;

export async function buildMedalRoleAutocompleteChoices({ guild, query }: { guild: Guild; query: string }) {
	const normalizedQuery = query.trim().toLowerCase();
	const roles = await guild.roles.fetch();

	return [...roles.values()]
		.filter((role): role is Role => Boolean(role))
		.filter((role) => role.name.startsWith(MEDAL_ROLE_PREFIX))
		.filter((role) => normalizedQuery.length === 0 || role.name.toLowerCase().includes(normalizedQuery))
		.sort((left, right) => left.name.localeCompare(right.name))
		.slice(0, DEFAULT_AUTOCOMPLETE_LIMIT)
		.map((role) => ({
			name: role.name.slice(0, 100),
			value: role.id
		}));
}

export async function buildMedalEventAutocompleteChoices({ query }: { query: string }) {
	const events = await staffMedalRepository.listRecentEvents({
		query,
		since: new Date(Date.now() - SEVEN_DAYS_IN_MS),
		limit: DEFAULT_AUTOCOMPLETE_LIMIT
	});

	return events.map((event) => ({
		name: `${formatRelativeDayLabel(event.createdAt)} | ${event.eventTier.name} | ${event.name}`.slice(0, 100),
		value: String(event.id)
	}));
}

export async function buildEventAttendeeAutocompleteChoices({ eventSessionId, query }: { eventSessionId: number; query: string }) {
	const recentEvent = await staffMedalRepository.getRecentEventById({
		eventSessionId,
		since: new Date(Date.now() - SEVEN_DAYS_IN_MS)
	});
	if (!recentEvent) {
		return [];
	}

	const attendees = await staffMedalRepository.listEventAttendees({
		eventSessionId,
		query,
		limit: DEFAULT_AUTOCOMPLETE_LIMIT
	});
	const totalMeritsByUserId = await meritRepository.getUsersTotalMerits({
		userDbUserIds: attendees.map((attendee) => attendee.user.id)
	});

	return attendees.map((attendee) => ({
		name: buildUserChoiceLabel(attendee.user, totalMeritsByUserId.get(attendee.user.id) ?? 0).slice(0, 100),
		value: attendee.user.discordUserId
	}));
}

export async function buildStandaloneMedalEligibleUserChoices({ query }: { query: string }) {
	const users = await staffMedalRepository.listStandaloneEligibleUsers({
		query,
		limit: DEFAULT_AUTOCOMPLETE_LIMIT
	});
	const totalMeritsByUserId = await meritRepository.getUsersTotalMerits({
		userDbUserIds: users.map((user) => user.id)
	});

	return users.map((user) => ({
		name: buildUserChoiceLabel(user, totalMeritsByUserId.get(user.id) ?? 0).slice(0, 100),
		value: user.discordUserId
	}));
}

function buildUserChoiceLabel(
	user: {
		id: string;
		discordUserId: string;
		discordNickname: string | null;
		discordUsername: string | null;
		divisionMemberships: Array<{
			division: Parameters<typeof buildUserNickname>[0]['divisions'][number];
		}>;
	},
	totalMerits: number
) {
	const baseNickname = user.discordNickname?.trim() || user.discordUsername?.trim() || user.discordUserId;

	try {
		return (
			buildUserNickname({
				isGuildOwner: false,
				baseNickname,
				divisions: user.divisionMemberships.map((membership) => membership.division),
				totalMerits
			}).newUserNickname ?? baseNickname
		);
	} catch (error) {
		if (isNicknameTooLongError(error)) {
			return baseNickname;
		}

		throw error;
	}
}

function formatRelativeDayLabel(value: Date) {
	const now = new Date();
	const dayDiff = Math.floor((now.getTime() - value.getTime()) / (24 * 60 * 60 * 1000));
	if (dayDiff <= 0) {
		return 'Today';
	}
	if (dayDiff === 1) {
		return 'Yesterday';
	}
	return `${dayDiff} days ago`;
}
