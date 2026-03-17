import { EventSessionChannelKind } from '@prisma/client';

import { buildAddTrackedChannelRenameReason } from './eventLifecycleChannelPolicy';
import type { AddTrackedChannelDeps, AddTrackedChannelWorkflowInput, ValidatedTrackedChannelAddition } from './addTrackedChannel';

export async function persistTrackedChannelAddition(
	deps: Pick<AddTrackedChannelDeps, 'upsertTrackedChannel' | 'renameVoiceChannel' | 'findEventSession' | 'syncTrackingSummary'>,
	input: AddTrackedChannelWorkflowInput,
	validated: Pick<ValidatedTrackedChannelAddition, 'eventSession' | 'existingChannelKind'>
): Promise<{ isNewChildChannel: boolean }> {
	const isNewChildChannel = validated.existingChannelKind === null;

	if (isNewChildChannel && input.actor.dbUserId) {
		await deps.upsertTrackedChannel({
			eventSessionId: validated.eventSession.id,
			channelId: input.targetVoiceChannelId,
			kind: EventSessionChannelKind.CHILD_VC,
			addedByDbUserId: input.actor.dbUserId
		});
	}

	if (input.renameTo && input.renameTo.trim().length > 0) {
		await deps.renameVoiceChannel({
			channelId: input.targetVoiceChannelId,
			name: input.renameTo.slice(0, 100),
			reason: buildAddTrackedChannelRenameReason({
				actorTag: input.actorTag
			})
		});
	}

	const refreshed = await deps.findEventSession(validated.eventSession.id);
	if (refreshed) {
		await deps.syncTrackingSummary(refreshed);
	}

	return {
		isNewChildChannel
	};
}
