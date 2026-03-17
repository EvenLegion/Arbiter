import type { ActorContext } from '../_shared/actor';

export function buildEndedParentVoiceChannelRename({ actor, actorTag }: { actor: ActorContext; actorTag?: string }) {
	return {
		name: 'Post Event Hangout',
		reason: `Event ended by ${actorTag ?? actor.discordTag ?? actor.discordUserId}`
	};
}

export function buildAddTrackedChannelRenameReason({ actorTag }: { actorTag: string }) {
	return `Event add-vc by ${actorTag}`;
}

export function buildAddTrackedChannelAnnouncementContent({
	actorDiscordUserId,
	childVoiceChannelId,
	parentVoiceChannelId,
	eventName
}: {
	actorDiscordUserId: string;
	childVoiceChannelId: string;
	parentVoiceChannelId: string | null;
	eventName: string;
}) {
	return `<@${actorDiscordUserId}> added <#${childVoiceChannelId}> as a sub channel under Main channel ${
		parentVoiceChannelId ? `<#${parentVoiceChannelId}>` : 'unknown Main channel'
	} for **${eventName}**.`;
}
