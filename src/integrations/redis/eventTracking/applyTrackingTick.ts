import { getRedisClient } from '../client';
import { parseRedisInteger } from './parsers';

const ACTIVE_SESSIONS_KEY = 'arbiter:event-tracking:active-sessions';
const SESSION_KEY_PREFIX = 'arbiter:event-tracking:session:';
const PARTICIPANTS_KEY_PREFIX = 'arbiter:event-tracking:participants:';

/**
 * Atomically applies one attendance tick for a session.
 *
 * Behavior:
 * - Verifies the session is in the active sessions set.
 * - If not active, returns 0 and performs no writes.
 * - Updates session metadata (`lastTickAtMs`, `status`).
 * - Increments attended seconds for each attendee ID passed in ARGV[5..n].
 * - Returns 1 when the tick was applied.
 */
const APPLY_TRACKING_TICK_SCRIPT = `
local activeKey = KEYS[1]
local sessionKey = KEYS[2]
local participantsKey = KEYS[3]

local sessionId = ARGV[1]
local tickedAtMs = ARGV[2]
local tickSeconds = tonumber(ARGV[3])
local status = ARGV[4]

if redis.call('SISMEMBER', activeKey, sessionId) ~= 1 then
	return 0
end

redis.call('HSET', sessionKey, 'lastTickAtMs', tickedAtMs, 'status', status)

for i = 5, #ARGV do
	redis.call('HINCRBY', participantsKey, ARGV[i], tickSeconds)
end

return 1
`;

type ApplyTrackingTickParams = {
	eventSessionId: number;
	attendeeDiscordUserIds: string[];
	tickDurationSeconds: number;
	tickedAtMs?: number;
};

export type ApplyTrackingTickResult = {
	applied: boolean;
	incrementedParticipantCount: number;
};

export async function applyTrackingTick({
	eventSessionId,
	attendeeDiscordUserIds,
	tickDurationSeconds,
	tickedAtMs = Date.now()
}: ApplyTrackingTickParams): Promise<ApplyTrackingTickResult> {
	if (tickDurationSeconds <= 0) {
		return {
			applied: false,
			incrementedParticipantCount: 0
		};
	}

	const redis = getRedisClient();
	const dedupedAttendeeIds = dedupeDiscordUserIds(attendeeDiscordUserIds);
	const sessionId = String(eventSessionId);

	const rawResult = await redis.eval(
		APPLY_TRACKING_TICK_SCRIPT,
		3,
		ACTIVE_SESSIONS_KEY,
		getSessionKey(eventSessionId),
		getParticipantsKey(eventSessionId),
		sessionId,
		String(tickedAtMs),
		String(tickDurationSeconds),
		'ACTIVE',
		...dedupedAttendeeIds
	);

	const applied = parseRedisInteger(rawResult, `applyTrackingTick result for eventSessionId=${eventSessionId}`) === 1;
	return {
		applied,
		incrementedParticipantCount: applied ? dedupedAttendeeIds.length : 0
	};
}

function getSessionKey(eventSessionId: number) {
	return `${SESSION_KEY_PREFIX}${eventSessionId}`;
}

function getParticipantsKey(eventSessionId: number) {
	return `${PARTICIPANTS_KEY_PREFIX}${eventSessionId}`;
}

function dedupeDiscordUserIds(discordUserIds: string[]) {
	return [...new Set(discordUserIds.map((discordUserId) => discordUserId.trim()).filter(Boolean))];
}
