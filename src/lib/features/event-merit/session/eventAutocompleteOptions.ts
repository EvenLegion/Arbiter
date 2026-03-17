import { EventSessionState } from '@prisma/client';

import { eventRepository } from '../../../../integrations/prisma/repositories';
import { formatEventSessionStateLabel } from '../ui/formatEventSessionStateLabel';
import { buildAvailableEventVoiceChannelChoices } from './eventVoiceChannelAutocomplete';

export async function buildEventTierAutocompleteChoices({ query }: { query: string }) {
	const normalizedQuery = query.trim().toLowerCase();
	const tiers = await eventRepository.listEventTiers({
		orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }]
	});

	return tiers
		.filter(
			(tier) =>
				normalizedQuery.length === 0 ||
				tier.name.toLowerCase().includes(normalizedQuery) ||
				tier.code.toLowerCase().includes(normalizedQuery) ||
				tier.description.toLowerCase().includes(normalizedQuery)
		)
		.slice(0, 25)
		.map((tier) => ({
			name: `${tier.name} ${tier.description} (${tier.meritType.meritAmount} merits)`,
			value: String(tier.id)
		}));
}

export async function buildEventSessionAutocompleteChoices({ query }: { query: string }) {
	const sessions = await eventRepository.listSessions({
		states: [EventSessionState.DRAFT, EventSessionState.ACTIVE],
		query,
		limit: 25,
		include: {
			eventTier: true
		},
		orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
	});

	return sessions.map((session) => ({
		name: `${session.eventTier.name} | ${session.name} | ${formatEventSessionStateLabel(session.state)}`,
		value: String(session.id)
	}));
}

export async function buildEventVoiceChannelAutocompleteChoices({ guild, query }: { guild: import('discord.js').Guild; query: string }) {
	const reservedChannelIds = await eventRepository.listReservedVoiceChannelIds();
	return buildAvailableEventVoiceChannelChoices({
		guild,
		query,
		reservedChannelIds
	});
}
