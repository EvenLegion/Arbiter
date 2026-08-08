import type { Guild } from 'discord.js';

import type { EventPingResultKind, EventPingSession } from '../../../../services/event-ping';
import { toErrorLogFields } from '../../../../logging/errorDetails';
import { resolveSendCapableGuildChannel, sendMessageToChannel } from '../../presentation/eventDiscordMessageGateway';

type EventPingLogger = {
	warn: (...values: readonly unknown[]) => void;
};

export function buildEventPingAnnouncementPayload({
	eventSession,
	parentVoiceChannelId,
	roleId
}: {
	eventSession: EventPingSession;
	parentVoiceChannelId: string;
	roleId: string;
}) {
	return {
		content: `<@&${roleId}> **${eventSession.name}** event has started! Please join <#${parentVoiceChannelId}> if you're interested in attending.`,
		allowedMentions: {
			parse: [],
			roles: [roleId],
			users: [],
			repliedUser: false
		},
		nonce: `event-ping-${eventSession.id}`,
		enforceNonce: true
	};
}

export function buildEventPingAuditPayload({
	eventSession,
	actorDiscordUserId,
	outcome
}: {
	eventSession: EventPingSession;
	actorDiscordUserId: string;
	outcome: Exclude<EventPingResultKind, 'forbidden' | 'event_not_found'>;
}) {
	const outcomeText: Record<typeof outcome, string> = {
		concurrency_conflict: 'could not start because another Event Ping or End Event action is in progress',
		coordination_unavailable: 'could not start because event coordination is unavailable; retry is allowed',
		invalid_state: 'was rejected because the event is no longer active',
		already_sent: 'was rejected because this event was already pinged',
		missing_parent_vc: 'was rejected because the tracked parent voice channel is missing',
		announcement_failed: 'failed before Discord accepted the announcement; retry is allowed',
		receipt_failed: 'reached Discord, but Arbiter could not persist the durable receipt; do not retry without operator review',
		sent: 'succeeded'
	};

	return {
		content: `Event Ping for **${eventSession.name}** ${outcomeText[outcome]} (requested by <@${actorDiscordUserId}>).`,
		allowedMentions: {
			parse: [],
			roles: [],
			users: [],
			repliedUser: false
		}
	};
}

export async function sendEventPingAnnouncement({
	guild,
	eventSession,
	parentVoiceChannelId,
	channelId,
	roleId,
	logger
}: {
	guild: Guild;
	eventSession: EventPingSession;
	parentVoiceChannelId: string;
	channelId: string;
	roleId: string;
	logger: EventPingLogger;
}) {
	const role = await guild.roles.fetch(roleId).catch((error: unknown) => {
		logger.warn(
			{
				...toErrorLogFields(error),
				eventSessionId: eventSession.id,
				roleId
			},
			'Failed to resolve configured Event Ping role'
		);
		return null;
	});
	if (!role) {
		return false;
	}

	const channel = await resolveSendCapableGuildChannel({
		guild,
		channelId
	});
	const sent = await sendMessageToChannel({
		channel,
		payload: buildEventPingAnnouncementPayload({
			eventSession,
			parentVoiceChannelId,
			roleId
		}),
		logger,
		failureLogMessage: 'Failed to send Event Ping announcement',
		logBindings: {
			eventSessionId: eventSession.id,
			channelId,
			roleId
		}
	});

	return sent !== null;
}

export async function postEventPingAudit({
	guild,
	eventSession,
	actorDiscordUserId,
	outcome,
	logger
}: {
	guild: Guild;
	eventSession: EventPingSession;
	actorDiscordUserId: string;
	outcome: Exclude<EventPingResultKind, 'forbidden' | 'event_not_found'>;
	logger: EventPingLogger;
}) {
	const channel = await resolveSendCapableGuildChannel({
		guild,
		channelId: eventSession.threadId
	});
	const sent = await sendMessageToChannel({
		channel,
		payload: buildEventPingAuditPayload({
			eventSession,
			actorDiscordUserId,
			outcome
		}),
		logger,
		failureLogMessage: 'Failed to post Event Ping tracking-thread audit',
		logBindings: {
			eventSessionId: eventSession.id,
			actorDiscordUserId,
			outcome
		}
	});

	return sent !== null;
}
