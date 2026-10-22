import type Redis from 'ioredis';
import { z } from 'zod';

import { digestOpaqueToken } from './crypto';
import type { AuthStore, BrowserSession } from './types';

const OAuthStateRecordSchema = z.object({ bindingDigest: z.string().length(64), redirectUri: z.url() }).strict();
const BrowserSessionRecordSchema = z
	.object({
		discordUserId: z.string().regex(/^\d{17,20}$/),
		createdAtMs: z.number().int().nonnegative(),
		lastSeenAtMs: z.number().int().nonnegative(),
		absoluteExpiresAtMs: z.number().int().positive(),
		csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
	})
	.strict();

const READ_AND_REFRESH_SESSION_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local ok, value = pcall(cjson.decode, raw)
if not ok then
	redis.call('DEL', KEYS[1])
	return nil
end
local nowMs = tonumber(ARGV[1])
local idleMs = tonumber(ARGV[2])
if not value.lastSeenAtMs or not value.absoluteExpiresAtMs or nowMs >= value.absoluteExpiresAtMs or nowMs - value.lastSeenAtMs >= idleMs then
	redis.call('DEL', KEYS[1])
	return nil
end
value.lastSeenAtMs = nowMs
local remainingAbsoluteMs = value.absoluteExpiresAtMs - nowMs
local ttlMs = math.min(idleMs, remainingAbsoluteMs)
redis.call('SET', KEYS[1], cjson.encode(value), 'PX', ttlMs)
return cjson.encode(value)
`;

export function createRedisAuthStore(redis: Redis): AuthStore {
	return {
		putOAuthState: async (state, record, ttlSeconds) => {
			const result = await redis.set(oauthStateKey(state), JSON.stringify(record), 'EX', ttlSeconds, 'NX');
			return result === 'OK';
		},
		consumeOAuthState: async (state) => {
			const raw = await redis.getdel(oauthStateKey(state));
			return parseRecord(OAuthStateRecordSchema, raw);
		},
		putSession: async (sessionId, record, ttlSeconds) => {
			const result = await redis.set(sessionKey(sessionId), JSON.stringify(record), 'EX', ttlSeconds, 'NX');
			return result === 'OK';
		},
		readAndRefreshSession: async (sessionId, nowMs, idleTtlSeconds) => {
			const raw = await redis.eval(READ_AND_REFRESH_SESSION_SCRIPT, 1, sessionKey(sessionId), String(nowMs), String(idleTtlSeconds * 1_000));
			if (typeof raw !== 'string') return null;
			const record = parseRecord(BrowserSessionRecordSchema, raw);
			if (!record) return null;
			return {
				...record,
				idleExpiresAtMs: Math.min(record.lastSeenAtMs + idleTtlSeconds * 1_000, record.absoluteExpiresAtMs)
			} satisfies BrowserSession;
		},
		revokeSession: async (sessionId) => {
			await redis.del(sessionKey(sessionId));
		}
	};
}

function oauthStateKey(state: string): string {
	return `auth:oauth-state:${digestOpaqueToken(state)}`;
}

function sessionKey(sessionId: string): string {
	return `auth:session:${digestOpaqueToken(sessionId)}`;
}

function parseRecord<T>(schema: z.ZodType<T>, raw: string | null): T | null {
	if (raw === null) return null;
	try {
		const parsed = schema.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}
