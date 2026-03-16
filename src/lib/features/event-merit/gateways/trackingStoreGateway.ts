import {
	clearTrackingSession,
	getTrackingParticipantsSnapshot,
	startTrackingSession,
	stopTrackingSession
} from '../../../../integrations/redis/eventTracking';

export async function startEventTrackingSession({
	eventSessionId,
	guildId,
	startedAtMs
}: {
	eventSessionId: number;
	guildId: string;
	startedAtMs: number;
}) {
	await startTrackingSession({
		eventSessionId,
		guildId,
		startedAtMs
	});
}

export async function stopEventTrackingSession({ eventSessionId }: { eventSessionId: number }) {
	await stopTrackingSession({
		eventSessionId
	});
}

export async function clearEventTrackingSession({ eventSessionId }: { eventSessionId: number }) {
	await clearTrackingSession({
		eventSessionId
	});
}

export async function getEventTrackingParticipantsSnapshot({ eventSessionId }: { eventSessionId: number }) {
	return getTrackingParticipantsSnapshot({
		eventSessionId
	});
}
