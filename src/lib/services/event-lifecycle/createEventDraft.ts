import type { EventTierLookup } from './eventLifecycleTypes';

type CreateEventDraftDeps = {
	findEventTier: (eventTierId: number) => Promise<EventTierLookup | null>;
	renamePrimaryVoiceChannel: (params: { channelId: string; name: string; reason: string }) => Promise<void>;
	createTrackingThread: (params: {
		eventName: string;
		tierName: string;
		issuerTag: string;
		issuerDiscordUserId: string;
	}) => Promise<{ threadId: string } | null>;
	createDraftEventSession: (params: {
		hostDbUserId: string;
		eventTierId: number;
		threadId: string;
		name: string;
		primaryChannelId: string;
		addedByDbUserId: string;
	}) => Promise<{ id: number; name: string }>;
	saveEventThreadChannel: (params: { eventSessionId: number; threadId: string; addedByDbUserId: string }) => Promise<void>;
	postTrackingSummary: (params: {
		eventSessionId: number;
		eventName: string;
		tierName: string;
		tierMeritAmount: number;
		hostDiscordUserId: string;
		primaryVoiceChannelId: string;
		trackingThreadId: string;
	}) => Promise<{
		threadSummaryMessageId: string;
		parentVoiceSummaryMessageId: string | null;
	}>;
	postThreadAnnouncement: (params: { threadId: string; actorDiscordUserId: string; eventName: string }) => Promise<void>;
	saveTrackingMessageRef: (params: { eventSessionId: number; channelId: string; messageId: string }) => Promise<void>;
	saveParentVoiceSummaryMessageRef: (params: { eventSessionId: number; channelId: string; messageId: string }) => Promise<void>;
	cleanupTrackingThread: (threadId: string) => Promise<void>;
};

export type CreateEventDraftResult =
	| { kind: 'tier_not_found' }
	| { kind: 'tracking_thread_failed' }
	| { kind: 'draft_created'; eventSessionId: number; trackingThreadId: string };

export async function createEventDraft(
	deps: CreateEventDraftDeps,
	input: {
		hostDbUserId: string;
		hostDiscordUserId: string;
		issuerTag: string;
		eventTierId: number;
		eventName: string;
		primaryVoiceChannelId: string;
	}
): Promise<CreateEventDraftResult> {
	const eventTier = await deps.findEventTier(input.eventTierId);
	if (!eventTier) {
		return {
			kind: 'tier_not_found'
		};
	}

	await deps.renamePrimaryVoiceChannel({
		channelId: input.primaryVoiceChannelId,
		name: buildParentVoiceChannelName({
			tierName: eventTier.name,
			eventName: input.eventName
		}),
		reason: `Event draft created by ${input.issuerTag}`
	});

	const thread = await deps.createTrackingThread({
		eventName: input.eventName,
		tierName: eventTier.name,
		issuerTag: input.issuerTag,
		issuerDiscordUserId: input.hostDiscordUserId
	});
	if (!thread) {
		return {
			kind: 'tracking_thread_failed'
		};
	}

	try {
		const eventSession = await deps.createDraftEventSession({
			hostDbUserId: input.hostDbUserId,
			eventTierId: eventTier.id,
			threadId: thread.threadId,
			name: input.eventName,
			primaryChannelId: input.primaryVoiceChannelId,
			addedByDbUserId: input.hostDbUserId
		});

		await deps.saveEventThreadChannel({
			eventSessionId: eventSession.id,
			threadId: thread.threadId,
			addedByDbUserId: input.hostDbUserId
		});

		const summaryMessages = await deps.postTrackingSummary({
			eventSessionId: eventSession.id,
			eventName: eventSession.name,
			tierName: eventTier.name,
			tierMeritAmount: eventTier.meritType.meritAmount,
			hostDiscordUserId: input.hostDiscordUserId,
			primaryVoiceChannelId: input.primaryVoiceChannelId,
			trackingThreadId: thread.threadId
		});

		await deps.postThreadAnnouncement({
			threadId: thread.threadId,
			actorDiscordUserId: input.hostDiscordUserId,
			eventName: eventSession.name
		});

		await deps.saveTrackingMessageRef({
			eventSessionId: eventSession.id,
			channelId: thread.threadId,
			messageId: summaryMessages.threadSummaryMessageId
		});
		if (summaryMessages.parentVoiceSummaryMessageId) {
			await deps.saveParentVoiceSummaryMessageRef({
				eventSessionId: eventSession.id,
				channelId: input.primaryVoiceChannelId,
				messageId: summaryMessages.parentVoiceSummaryMessageId
			});
		}

		return {
			kind: 'draft_created',
			eventSessionId: eventSession.id,
			trackingThreadId: thread.threadId
		};
	} catch (error) {
		await deps.cleanupTrackingThread(thread.threadId).catch(() => undefined);
		throw error;
	}
}

function buildParentVoiceChannelName({ tierName, eventName }: { tierName: string; eventName: string }) {
	return `${tierName} | ${eventName}`.slice(0, 100);
}
