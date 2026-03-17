import { eventRepository, meritRepository } from '../../../../integrations/prisma/repositories';
import { buildGuildMemberAutocompleteChoices } from '../../../discord/memberDirectory';

export async function buildMeritExistingEventChoices({ query }: { query: string }) {
	const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
	const sessions = await eventRepository.listSessions({
		where: {
			createdAt: {
				gte: fiveDaysAgo
			}
		},
		include: {
			eventTier: true
		},
		orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
		query,
		limit: 25
	});

	return sessions.map((session) => ({
		name: `${formatRelativeDayLabel(session.createdAt)} | ${session.eventTier.name} | ${session.name}`.slice(0, 100),
		value: String(session.id)
	}));
}

export async function buildManualMeritTypeChoices({ query }: { query: string }) {
	const meritTypes = await meritRepository.listMeritTypes({
		query,
		where: {
			isManualAwardable: true
		},
		orderBy: [{ meritAmount: 'desc' }, { name: 'asc' }],
		limit: 25
	});

	return meritTypes.map((type) => ({
		name: `${type.name} (${formatSignedMeritAmount(type.meritAmount)} merits)`.slice(0, 100),
		value: type.code
	}));
}

export async function buildMeritMemberChoices({ guild, query }: { guild: import('discord.js').Guild; query: string }) {
	return buildGuildMemberAutocompleteChoices({
		guild,
		query: query.trim().toLowerCase()
	});
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

function formatSignedMeritAmount(amount: number) {
	return amount >= 0 ? `+${amount}` : `${amount}`;
}
