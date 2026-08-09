import { getRedisClient } from './client';

const EVENT_SESSION_OPERATION_LOCK_PREFIX = 'arbiter:event-session:operation-lock:';

const RELEASE_EVENT_SESSION_OPERATION_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
	return redis.call('DEL', KEYS[1])
end

return 0
`;

const RENEW_EVENT_SESSION_OPERATION_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
	return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end

return 0
`;

export const EVENT_SESSION_OPERATION_LOCK_TTL_MS = 60_000;
export const EVENT_SESSION_OPERATION_LOCK_RENEW_INTERVAL_MS = 20_000;

export type EventSessionOperationLease = {
	ensureOwned: () => Promise<boolean>;
	stop: () => Promise<void>;
};

export async function acquireEventSessionOperationLock({
	eventSessionId,
	token,
	ttlMs = EVENT_SESSION_OPERATION_LOCK_TTL_MS
}: {
	eventSessionId: number;
	token: string;
	ttlMs?: number;
}) {
	const redis = getRedisClient();
	const result = await redis.set(getEventSessionOperationLockKey(eventSessionId), token, 'PX', ttlMs, 'NX');
	return result === 'OK';
}

export async function releaseEventSessionOperationLock({ eventSessionId, token }: { eventSessionId: number; token: string }) {
	const redis = getRedisClient();
	const result = await redis.eval(RELEASE_EVENT_SESSION_OPERATION_LOCK_SCRIPT, 1, getEventSessionOperationLockKey(eventSessionId), token);
	return Number(result) === 1;
}

export async function renewEventSessionOperationLock({
	eventSessionId,
	token,
	ttlMs = EVENT_SESSION_OPERATION_LOCK_TTL_MS
}: {
	eventSessionId: number;
	token: string;
	ttlMs?: number;
}) {
	const redis = getRedisClient();
	const result = await redis.eval(
		RENEW_EVENT_SESSION_OPERATION_LOCK_SCRIPT,
		1,
		getEventSessionOperationLockKey(eventSessionId),
		token,
		String(ttlMs)
	);
	return Number(result) === 1;
}

export function startEventSessionOperationLockLease({
	eventSessionId,
	token,
	ttlMs = EVENT_SESSION_OPERATION_LOCK_TTL_MS,
	renewIntervalMs = EVENT_SESSION_OPERATION_LOCK_RENEW_INTERVAL_MS,
	onRenewalError
}: {
	eventSessionId: number;
	token: string;
	ttlMs?: number;
	renewIntervalMs?: number;
	onRenewalError?: (error: unknown) => void;
}): EventSessionOperationLease {
	let stopped = false;
	let ownershipLost = false;
	let renewalInFlight: Promise<boolean> | null = null;

	const ensureOwned = async () => {
		if (stopped || ownershipLost) {
			return false;
		}
		if (renewalInFlight) {
			return renewalInFlight;
		}

		renewalInFlight = renewEventSessionOperationLock({
			eventSessionId,
			token,
			ttlMs
		})
			.catch((error: unknown) => {
				onRenewalError?.(error);
				return false;
			})
			.then((renewed) => {
				if (!renewed) {
					ownershipLost = true;
				}
				return renewed;
			})
			.finally(() => {
				renewalInFlight = null;
			});

		return renewalInFlight;
	};

	const timer = setInterval(() => {
		void ensureOwned();
	}, renewIntervalMs);
	timer.unref();

	return {
		ensureOwned,
		stop: async () => {
			stopped = true;
			clearInterval(timer);
			await renewalInFlight;
		}
	};
}

export function getEventSessionOperationLockKey(eventSessionId: number) {
	return `${EVENT_SESSION_OPERATION_LOCK_PREFIX}${eventSessionId}`;
}
