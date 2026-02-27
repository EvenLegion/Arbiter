import { getRedisClient } from '../client';

const PARTICIPANTS_KEY_PREFIX = 'arbiter:event-tracking:participants:';

type GetTrackingParticipantsSnapshotParams = {
	eventSessionId: number;
};

export type TrackingParticipantSnapshot = {
	discordUserId: string;
	attendedSeconds: number;
};

export async function getTrackingParticipantsSnapshot({
	eventSessionId
}: GetTrackingParticipantsSnapshotParams): Promise<TrackingParticipantSnapshot[]> {
	const redis = getRedisClient();
	const participantsHash = await redis.hgetall(getParticipantsKey(eventSessionId));
	const snapshots: TrackingParticipantSnapshot[] = [];

	for (const [discordUserId, rawAttendedSeconds] of Object.entries(participantsHash)) {
		snapshots.push({
			discordUserId,
			attendedSeconds: parseIntegerField(rawAttendedSeconds, discordUserId, eventSessionId)
		});
	}

	return snapshots.sort((left, right) => {
		if (left.attendedSeconds !== right.attendedSeconds) {
			return right.attendedSeconds - left.attendedSeconds;
		}

		return left.discordUserId.localeCompare(right.discordUserId);
	});
}

function getParticipantsKey(eventSessionId: number) {
	return `${PARTICIPANTS_KEY_PREFIX}${eventSessionId}`;
}

function parseIntegerField(rawValue: string, discordUserId: string, eventSessionId: number): number {
	const parsed = Number.parseInt(rawValue, 10);
	if (Number.isNaN(parsed)) {
		throw new Error(
			`Invalid tracking participants hash value: eventSessionId=${eventSessionId} discordUserId=${discordUserId} value=${rawValue}`
		);
	}

	return parsed;
}
