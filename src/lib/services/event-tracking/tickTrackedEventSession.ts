import { EventSessionChannelKind, EventSessionState } from '@prisma/client';

import { resolveTrackedAttendeeDiscordUserIds } from '../../../utilities/eventTracking/resolveTrackedAttendees';
import type { EventTrackingServiceDeps, TickTrackedEventSessionInput, TickTrackedEventSessionResult } from './eventTrackingTypes';

export async function tickTrackedEventSession(
	deps: Pick<EventTrackingServiceDeps, 'resolveVoiceChannel' | 'applyTrackingTick' | 'tickDurationSeconds' | 'warningStore'>,
	{ guild, session, context }: TickTrackedEventSessionInput
): Promise<TickTrackedEventSessionResult> {
	const logger = context.logger.child({ caller: 'tickTrackedEventSession' });
	const trackedVoiceChannelIds = session.channels
		.filter((channel) => channel.kind === EventSessionChannelKind.PARENT_VC || channel.kind === EventSessionChannelKind.CHILD_VC)
		.map((channel) => channel.channelId);

	const attendeeDiscordUserIds = await resolveTrackedAttendeeDiscordUserIds({
		guild,
		eventSessionId: session.id,
		trackedVoiceChannelIds,
		context,
		warningStore: deps.warningStore,
		resolveVoiceChannel: deps.resolveVoiceChannel
	});

	const result =
		session.state === EventSessionState.ACTIVE
			? await deps.applyTrackingTick({
					eventSessionId: session.id,
					attendeeDiscordUserIds,
					tickDurationSeconds: deps.tickDurationSeconds
				})
			: {
					applied: false
				};

	logger.trace(
		{
			eventSessionId: session.id,
			trackedVoiceChannelCount: trackedVoiceChannelIds.length,
			attendeeCount: attendeeDiscordUserIds.length,
			applied: result.applied
		},
		'Applied event tracking tick'
	);

	return {
		eventSessionId: session.id,
		trackedVoiceChannelCount: trackedVoiceChannelIds.length,
		attendeeCount: attendeeDiscordUserIds.length,
		applied: result.applied
	};
}
