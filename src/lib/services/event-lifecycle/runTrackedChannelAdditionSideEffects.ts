import { buildAddTrackedChannelAnnouncementContent } from './eventLifecycleChannelPolicy';
import type {
	AddTrackedChannelDeps,
	AddTrackedChannelResult,
	AddTrackedChannelWorkflowInput,
	ValidatedTrackedChannelAddition
} from './addTrackedChannel';

export async function runTrackedChannelAdditionSideEffects(
	deps: Pick<AddTrackedChannelDeps, 'postEventThreadLog' | 'postPublicAnnouncement'>,
	input: AddTrackedChannelWorkflowInput,
	validated: Pick<ValidatedTrackedChannelAddition, 'eventSession' | 'parentVoiceChannelId'>,
	isNewChildChannel: boolean
): Promise<AddTrackedChannelResult> {
	if (!isNewChildChannel) {
		return {
			kind: 'already_tracked',
			channelId: input.targetVoiceChannelId,
			eventName: validated.eventSession.name
		};
	}

	await deps.postEventThreadLog({
		threadId: validated.eventSession.threadId,
		eventName: validated.eventSession.name,
		actorDiscordUserId: input.actor.discordUserId,
		channelId: input.targetVoiceChannelId,
		parentVoiceChannelId: validated.parentVoiceChannelId
	});

	const announcement = await deps.postPublicAnnouncement({
		parentVoiceChannelId: validated.parentVoiceChannelId,
		childVoiceChannelId: input.targetVoiceChannelId,
		content: buildAddTrackedChannelAnnouncementContent({
			actorDiscordUserId: input.actor.discordUserId,
			childVoiceChannelId: input.targetVoiceChannelId,
			parentVoiceChannelId: validated.parentVoiceChannelId,
			eventName: validated.eventSession.name
		}),
		eventSessionId: validated.eventSession.id
	});

	return {
		kind: 'channel_added',
		channelId: input.targetVoiceChannelId,
		eventName: validated.eventSession.name,
		parentVoiceChannelId: validated.parentVoiceChannelId,
		announcementComplete: announcement.childPosted && announcement.parentPosted
	};
}
