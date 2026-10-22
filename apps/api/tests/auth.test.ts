import type { ApiAuthIdentity } from '@arbiter/api-contracts';
import { describe, expect, it, vi } from 'vitest';

import { createDiscordOAuthClient } from '../src/auth/discordOAuthClient';
import { createAuthService } from '../src/auth/service';
import type { AuthRepository, AuthStore, BrowserSessionRecord, OAuthStateRecord } from '../src/auth/types';

const CALLBACK_URL = 'http://127.0.0.1:3000/api/v1/auth/discord/callback';
const REDIRECT_URL = 'http://127.0.0.1:4173/auth/callback';
const STAFF_IDENTITY: ApiAuthIdentity = {
	userId: '33b20a61-1e86-4115-b999-f319808d5a87',
	discordUserId: '100000000000000001',
	discordUsername: 'staff-user',
	discordNickname: 'Staff User',
	discordAvatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
	role: 'STAFF'
};

describe('API browser authentication service', () => {
	it('creates browser-bound, exact-redirect OAuth state using only the identify scope', async () => {
		const store = createMemoryStore();
		const service = createService(store);
		const started = await service.beginOAuth({ redirectUri: REDIRECT_URL });
		const authorizationUrl = new URL(started.authorizationUrl);
		expect(authorizationUrl.origin).toBe('https://discord.com');
		expect(authorizationUrl.searchParams.get('scope')).toBe('identify');
		expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(CALLBACK_URL);
		expect(authorizationUrl.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(started.bindingId).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect([...store.oauthStates.values()][0]).toMatchObject({ redirectUri: REDIRECT_URL, ttlSeconds: 600 });
		await expect(service.beginOAuth({ redirectUri: REDIRECT_URL, bindingId: started.bindingId })).resolves.toMatchObject({
			bindingId: started.bindingId
		});
		await expect(service.beginOAuth({ redirectUri: 'http://127.0.0.1:4173/unapproved' })).rejects.toMatchObject({
			code: 'invalid_redirect'
		});
	});

	it('consumes OAuth state before rejecting a mismatched browser and rejects replay', async () => {
		const store = createMemoryStore();
		const oauthClient = { resolveDiscordUserId: vi.fn().mockResolvedValue(STAFF_IDENTITY.discordUserId) };
		const service = createService(store, { oauthClient });
		const started = await service.beginOAuth({ redirectUri: REDIRECT_URL });
		const state = new URL(started.authorizationUrl).searchParams.get('state')!;

		await expect(service.completeOAuth({ code: 'code', state, bindingId: 'A'.repeat(43) })).rejects.toMatchObject({
			code: 'invalid_oauth_state'
		});
		await expect(service.completeOAuth({ code: 'code', state, bindingId: started.bindingId })).rejects.toMatchObject({
			code: 'invalid_oauth_state'
		});
		expect(oauthClient.resolveDiscordUserId).not.toHaveBeenCalled();
	});

	it('rotates an existing session after OAuth and denies unknown and non-staff identities alike', async () => {
		const store = createMemoryStore();
		const repository: AuthRepository = { findStaffIdentityByDiscordUserId: vi.fn().mockResolvedValue(STAFF_IDENTITY) };
		const service = createService(store, { repository });
		const oldSessionId = 'O'.repeat(43);
		store.sessions.set(oldSessionId, sessionRecord(STAFF_IDENTITY.discordUserId));
		const started = await service.beginOAuth({ redirectUri: REDIRECT_URL });
		const state = new URL(started.authorizationUrl).searchParams.get('state')!;
		const completed = await service.completeOAuth({
			code: 'discord-code',
			state,
			bindingId: started.bindingId,
			existingSessionId: oldSessionId
		});
		expect(completed.sessionId).not.toBe(oldSessionId);
		expect(store.sessions.has(oldSessionId)).toBe(false);
		expect(store.sessions.has(completed.sessionId)).toBe(true);

		(repository.findStaffIdentityByDiscordUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
		const deniedStart = await service.beginOAuth({ redirectUri: REDIRECT_URL });
		await expect(
			service.completeOAuth({
				code: 'discord-code',
				state: new URL(deniedStart.authorizationUrl).searchParams.get('state')!,
				bindingId: deniedStart.bindingId
			})
		).rejects.toMatchObject({ code: 'forbidden' });
	});

	it('re-reads canonical authorization on every protected request and revokes removed staff', async () => {
		const store = createMemoryStore();
		const repository: AuthRepository = { findStaffIdentityByDiscordUserId: vi.fn().mockResolvedValue(STAFF_IDENTITY) };
		const service = createService(store, { repository });
		const sessionId = 'S'.repeat(43);
		store.sessions.set(sessionId, sessionRecord(STAFF_IDENTITY.discordUserId));

		await expect(service.requireSession(sessionId)).resolves.toMatchObject({ identity: STAFF_IDENTITY, csrfToken: 'C'.repeat(43) });
		await expect(service.requireMutationSession(sessionId, 'C'.repeat(43))).resolves.toMatchObject({ identity: STAFF_IDENTITY });
		await expect(service.requireMutationSession(sessionId, 'X'.repeat(43))).rejects.toMatchObject({ code: 'csrf_failed' });
		(repository.findStaffIdentityByDiscordUserId as ReturnType<typeof vi.fn>).mockResolvedValue({ ...STAFF_IDENTITY, role: 'EXEC' });
		await expect(service.requireSession(sessionId)).resolves.toMatchObject({ identity: { role: 'EXEC' } });
		(repository.findStaffIdentityByDiscordUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
		await expect(service.requireSession(sessionId)).rejects.toMatchObject({ code: 'forbidden' });
		expect(store.sessions.has(sessionId)).toBe(false);
		expect(repository.findStaffIdentityByDiscordUserId).toHaveBeenCalledTimes(5);
	});

	it('requires the session-bound CSRF token before logout', async () => {
		const store = createMemoryStore();
		const service = createService(store);
		const sessionId = 'S'.repeat(43);
		store.sessions.set(sessionId, sessionRecord(STAFF_IDENTITY.discordUserId));
		await expect(service.logout(sessionId, 'X'.repeat(43))).rejects.toMatchObject({ code: 'csrf_failed' });
		expect(store.sessions.has(sessionId)).toBe(true);
		await expect(service.logout(sessionId, 'C'.repeat(43))).resolves.toBeUndefined();
		expect(store.sessions.has(sessionId)).toBe(false);
	});

	it('collapses Redis and Postgres failures to a typed unavailable result', async () => {
		const failingStore = createMemoryStore();
		failingStore.putOAuthState = vi.fn().mockRejectedValue(new Error('redis connection details'));
		await expect(createService(failingStore).beginOAuth({ redirectUri: REDIRECT_URL })).rejects.toMatchObject({
			code: 'service_unavailable'
		});

		const store = createMemoryStore();
		const sessionId = 'S'.repeat(43);
		store.sessions.set(sessionId, sessionRecord(STAFF_IDENTITY.discordUserId));
		const service = createService(store, {
			repository: { findStaffIdentityByDiscordUserId: vi.fn().mockRejectedValue(new Error('database connection details')) }
		});
		await expect(service.requireSession(sessionId)).rejects.toMatchObject({ code: 'service_unavailable' });
	});

	it('revokes a newly persisted session when the request is aborted before completion', async () => {
		const store = createMemoryStore();
		const service = createService(store);
		const started = await service.beginOAuth({ redirectUri: REDIRECT_URL });
		const state = new URL(started.authorizationUrl).searchParams.get('state')!;
		const controller = new AbortController();
		const putSession = store.putSession;
		store.putSession = async (...args) => {
			const stored = await putSession(...args);
			controller.abort(new Error('request deadline exceeded'));
			return stored;
		};

		await expect(
			service.completeOAuth({ code: 'discord-code', state, bindingId: started.bindingId, signal: controller.signal })
		).rejects.toMatchObject({ code: 'service_unavailable' });
		expect(store.sessions.size).toBe(0);
	});
});

describe('Discord OAuth client', () => {
	it('exchanges the code, resolves only the Discord user ID, and never returns tokens', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'temporary-access-token', token_type: 'Bearer' }), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ id: STAFF_IDENTITY.discordUserId, username: 'ignored' }), { status: 200 }));
		const client = createDiscordOAuthClient({
			clientId: '100000000000000001',
			clientSecret: 'discord-client-secret',
			callbackUrl: CALLBACK_URL,
			fetchImpl
		});
		await expect(client.resolveDiscordUserId('single-use-code')).resolves.toBe(STAFF_IDENTITY.discordUserId);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(fetchImpl.mock.calls[1]?.[1]?.headers).toEqual({ authorization: 'Bearer temporary-access-token' });
	});

	it('cancels an in-flight Discord exchange when its request is aborted', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
			(_input, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
				})
		);
		const client = createDiscordOAuthClient({
			clientId: '100000000000000001',
			clientSecret: 'discord-client-secret',
			callbackUrl: CALLBACK_URL,
			fetchImpl
		});
		const controller = new AbortController();
		const exchange = client.resolveDiscordUserId('single-use-code', controller.signal);
		controller.abort(new Error('request deadline exceeded'));

		await expect(exchange).rejects.toThrow('request deadline exceeded');
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('keeps cancellation active while reading a Discord response body', async () => {
		let bodyStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			bodyStarted = resolve;
		});
		const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
			return {
				ok: true,
				json: () =>
					new Promise((_resolve, reject) => {
						bodyStarted?.();
						init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
					})
			} as Response;
		});
		const client = createDiscordOAuthClient({
			clientId: '100000000000000001',
			clientSecret: 'discord-client-secret',
			callbackUrl: CALLBACK_URL,
			fetchImpl
		});
		const controller = new AbortController();
		const exchange = client.resolveDiscordUserId('single-use-code', controller.signal);
		await started;
		controller.abort(new Error('client disconnected'));

		await expect(exchange).rejects.toThrow('client disconnected');
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});
});

function createService(
	store: ReturnType<typeof createMemoryStore>,
	overrides: {
		repository?: AuthRepository;
		oauthClient?: { resolveDiscordUserId: (code: string) => Promise<string> };
	} = {}
) {
	return createAuthService({
		store,
		repository: overrides.repository ?? { findStaffIdentityByDiscordUserId: vi.fn().mockResolvedValue(STAFF_IDENTITY) },
		oauthClient: overrides.oauthClient ?? { resolveDiscordUserId: vi.fn().mockResolvedValue(STAFF_IDENTITY.discordUserId) },
		clientId: '100000000000000001',
		callbackUrl: CALLBACK_URL,
		allowedRedirectUrls: [REDIRECT_URL],
		stateTtlSeconds: 600,
		sessionIdleTtlSeconds: 1_800,
		sessionAbsoluteTtlSeconds: 28_800,
		now: () => 1_786_270_000_000
	});
}

function createMemoryStore(): AuthStore & {
	oauthStates: Map<string, OAuthStateRecord & { ttlSeconds: number }>;
	sessions: Map<string, BrowserSessionRecord>;
} {
	const oauthStates = new Map<string, OAuthStateRecord & { ttlSeconds: number }>();
	const sessions = new Map<string, BrowserSessionRecord>();
	return {
		oauthStates,
		sessions,
		putOAuthState: async (state, record, ttlSeconds) => {
			if (oauthStates.has(state)) return false;
			oauthStates.set(state, { ...record, ttlSeconds });
			return true;
		},
		consumeOAuthState: async (state) => {
			const record = oauthStates.get(state);
			oauthStates.delete(state);
			return record ?? null;
		},
		putSession: async (sessionId, record) => {
			if (sessions.has(sessionId)) return false;
			sessions.set(sessionId, record);
			return true;
		},
		readAndRefreshSession: async (sessionId, nowMs, idleTtlSeconds) => {
			const record = sessions.get(sessionId);
			if (!record || nowMs >= record.absoluteExpiresAtMs || nowMs - record.lastSeenAtMs >= idleTtlSeconds * 1_000) {
				sessions.delete(sessionId);
				return null;
			}
			record.lastSeenAtMs = nowMs;
			return { ...record, idleExpiresAtMs: Math.min(nowMs + idleTtlSeconds * 1_000, record.absoluteExpiresAtMs) };
		},
		revokeSession: async (sessionId) => {
			sessions.delete(sessionId);
		}
	};
}

function sessionRecord(discordUserId: string): BrowserSessionRecord {
	return {
		discordUserId,
		createdAtMs: 1_786_270_000_000,
		lastSeenAtMs: 1_786_270_000_000,
		absoluteExpiresAtMs: 1_786_298_800_000,
		csrfToken: 'C'.repeat(43)
	};
}
