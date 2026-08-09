import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiConfig } from '../src/config';
import type { AuthService } from '../src/auth/types';
import type { ApiCredentialService } from '../src/credentials/types';
import { createApiRuntime, type ApiRuntime } from '../src/http/server';
import type { ApiDependencies } from '../src/runtime/dependencies';

const config: ApiConfig = {
	nodeEnv: 'test',
	host: '127.0.0.1',
	port: 0,
	logLevel: 'silent',
	logFilePath: 'unused.log',
	consoleLogLevel: 'silent',
	bodyLimitBytes: 16,
	requestTimeoutMs: 2_000,
	headersTimeoutMs: 2_000,
	keepAliveTimeoutMs: 1_000,
	readinessTimeoutMs: 100,
	databaseConnectTimeoutMs: 1_000,
	redisConnectTimeoutMs: 1_000,
	shutdownTimeoutMs: 2_000,
	databaseUrl: 'postgresql://unused',
	databasePoolMax: 1,
	credentialPepper: 'test-credential-pepper-at-least-32-characters',
	auth: {
		discordClientId: '100000000000000001',
		discordClientSecret: 'test-discord-client-secret',
		discordCallbackUrl: 'http://127.0.0.1:3000/api/v1/auth/discord/callback',
		allowedOrigins: ['http://127.0.0.1:4173'],
		allowedRedirectUrls: ['http://127.0.0.1:4173/auth/callback'],
		stateTtlSeconds: 600,
		sessionIdleTtlSeconds: 1_800,
		sessionAbsoluteTtlSeconds: 28_800
	},
	redis: { host: 'unused', port: 6379, db: 0, namespace: 'arbiter:api:v1', maxTtlSeconds: 60 }
};

describe('API HTTP runtime', () => {
	let runtime: ApiRuntime | undefined;

	afterEach(async () => {
		await runtime?.stop();
	});

	it('serves health and sanitized readiness responses with request IDs', async () => {
		const dependencies = createDependencies(false);
		runtime = createApiRuntime({ config, dependencies, logger: pino({ level: 'silent' }) });
		const address = await runtime.start();
		const baseUrl = `http://127.0.0.1:${address.port}`;

		const health = await fetch(`${baseUrl}/api/v1/health`, { headers: { 'x-request-id': 'test-request-1' } });
		expect(health.status).toBe(200);
		expect(health.headers.get('x-request-id')).toBe('test-request-1');
		expect(health.headers.get('referrer-policy')).toBe('no-referrer');
		expect(health.headers.get('x-content-type-options')).toBe('nosniff');
		expect(await health.json()).toEqual({ data: { status: 'ok' }, meta: { requestId: 'test-request-1' } });

		const readiness = await fetch(`${baseUrl}/api/v1/readiness`);
		expect(readiness.status).toBe(503);
		expect(await readiness.json()).toEqual({
			data: { status: 'not_ready' },
			meta: { requestId: expect.any(String) }
		});
	});

	it('uses the common error envelope for methods, routes, and body limits', async () => {
		runtime = createApiRuntime({ config, dependencies: createDependencies(true), logger: pino({ level: 'silent' }) });
		const address = await runtime.start();
		const baseUrl = `http://127.0.0.1:${address.port}`;

		const methodResponse = await fetch(`${baseUrl}/api/v1/health`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}'
		});
		expect(methodResponse.status).toBe(405);
		expect(await methodResponse.json()).toMatchObject({ error: { code: 'method_not_allowed' } });

		const routeResponse = await fetch(`${baseUrl}/api/v1/unknown`);
		expect(routeResponse.status).toBe(404);
		expect(await routeResponse.json()).toMatchObject({ error: { code: 'not_found' } });

		const bodyResponse = await fetch(`${baseUrl}/api/v1/health`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ value: 'more-than-sixteen-bytes' })
		});
		expect(bodyResponse.status).toBe(413);
		expect(await bodyResponse.json()).toMatchObject({ error: { code: 'payload_too_large' } });
	});

	it('closes only its injected dependencies and is idempotent', async () => {
		const dependencies = createDependencies(true);
		runtime = createApiRuntime({ config, dependencies, logger: pino({ level: 'silent' }) });
		await runtime.start();
		await Promise.all([runtime.stop(), runtime.stop()]);
		expect(dependencies.close).toHaveBeenCalledTimes(1);
	});

	it('returns the common envelope when request work exceeds the deadline', async () => {
		const dependencies: ApiDependencies = {
			authService: {} as AuthService,
			credentialService: {} as ApiCredentialService,
			checkReadiness: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(true), 100))),
			close: vi.fn().mockResolvedValue(undefined)
		};
		runtime = createApiRuntime({
			config: { ...config, requestTimeoutMs: 20 },
			dependencies,
			logger: pino({ level: 'silent' })
		});
		const address = await runtime.start();
		const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/readiness`);

		expect(response.status).toBe(408);
		expect(await response.json()).toMatchObject({ error: { code: 'request_timeout' } });
	});

	it('aborts OAuth callback work when the request deadline expires', async () => {
		let callbackSignal: AbortSignal | undefined;
		const authService = {
			completeOAuth: vi.fn().mockImplementation(async ({ signal }: { signal?: AbortSignal }) => {
				callbackSignal = signal;
				await new Promise<never>((_resolve, reject) => {
					if (signal?.aborted) {
						reject(signal.reason);
						return;
					}
					signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
				});
			})
		} as unknown as AuthService;
		runtime = createApiRuntime({
			config: { ...config, requestTimeoutMs: 20 },
			dependencies: { ...createDependencies(true), authService },
			logger: pino({ level: 'silent' })
		});
		const address = await runtime.start();
		const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/discord/callback?code=discord-code&state=${'T'.repeat(43)}`, {
			headers: { cookie: `arbiter_oauth_binding=${'B'.repeat(43)}` },
			redirect: 'manual'
		});

		expect(response.status).toBe(408);
		expect(await response.json()).toMatchObject({ error: { code: 'request_timeout' } });
		expect(callbackSignal?.aborted).toBe(true);
	});

	it('supports an exact external origin across login, session, CSRF logout, and CORS', async () => {
		const authService: AuthService = {
			beginOAuth: vi
				.fn()
				.mockResolvedValue({ authorizationUrl: 'https://discord.com/oauth2/authorize?scope=identify', bindingId: 'B'.repeat(43) }),
			completeOAuth: vi.fn().mockResolvedValue({ sessionId: 'S'.repeat(43), redirectUri: 'http://127.0.0.1:4173/auth/callback' }),
			requireSession: vi.fn().mockResolvedValue({
				identity: {
					userId: '33b20a61-1e86-4115-b999-f319808d5a87',
					discordUserId: '100000000000000001',
					discordUsername: 'staff-user',
					discordNickname: 'Staff User',
					discordAvatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
					role: 'STAFF'
				},
				csrfToken: 'C'.repeat(43),
				idleExpiresAt: '2026-08-09T18:30:00.000Z',
				absoluteExpiresAt: '2026-08-10T02:00:00.000Z'
			}),
			logout: vi.fn().mockResolvedValue(undefined)
		};
		runtime = createApiRuntime({
			config: { ...config, nodeEnv: 'production', bodyLimitBytes: 1_024 },
			dependencies: { ...createDependencies(true), authService },
			logger: pino({ level: 'silent' })
		});
		const address = await runtime.start();
		const baseUrl = `http://127.0.0.1:${address.port}`;
		const origin = 'http://127.0.0.1:4173';

		const preflight = await fetch(`${baseUrl}/api/v1/auth/discord/start`, { method: 'OPTIONS', headers: { origin } });
		expect(preflight.status).toBe(204);
		expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);
		expect(preflight.headers.get('access-control-allow-credentials')).toBe('true');

		const denied = await fetch(`${baseUrl}/api/v1/auth/discord/start`, {
			method: 'POST',
			headers: { origin: 'https://unlisted.example', 'content-type': 'application/json' },
			body: JSON.stringify({ redirectUri: 'http://127.0.0.1:4173/auth/callback' })
		});
		expect(denied.status).toBe(403);
		expect(denied.headers.get('access-control-allow-origin')).toBeNull();

		const started = await fetch(`${baseUrl}/api/v1/auth/discord/start`, {
			method: 'POST',
			headers: { origin, 'content-type': 'application/json' },
			body: JSON.stringify({ redirectUri: 'http://127.0.0.1:4173/auth/callback' })
		});
		expect(started.status).toBe(200);
		expect(started.headers.get('set-cookie')).toContain('arbiter_oauth_binding=');
		expect(started.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Lax; Secure');
		expect(started.headers.get('set-cookie')).not.toContain('Domain=');

		const callback = await fetch(`${baseUrl}/api/v1/auth/discord/callback?code=discord-code&state=${'T'.repeat(43)}`, {
			headers: { cookie: `arbiter_oauth_binding=${'B'.repeat(43)}` },
			redirect: 'manual'
		});
		expect(callback.status).toBe(302);
		expect(callback.headers.get('location')).toBe('http://127.0.0.1:4173/auth/callback');
		expect(callback.headers.get('set-cookie')).toContain(`arbiter_session=${'S'.repeat(43)}`);
		expect(authService.completeOAuth).toHaveBeenCalledWith(
			expect.objectContaining({
				code: 'discord-code',
				state: 'T'.repeat(43),
				bindingId: 'B'.repeat(43),
				existingSessionId: undefined
			})
		);

		const session = await fetch(`${baseUrl}/api/v1/auth/session`, {
			headers: { origin, cookie: `arbiter_session=${'S'.repeat(43)}` }
		});
		expect(session.status).toBe(200);
		expect(await session.json()).toMatchObject({ data: { authenticated: true, csrfToken: 'C'.repeat(43) } });

		const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
			method: 'POST',
			headers: { origin, cookie: `arbiter_session=${'S'.repeat(43)}`, 'x-csrf-token': 'C'.repeat(43) }
		});
		expect(logout.status).toBe(200);
		expect(authService.logout).toHaveBeenCalledWith('S'.repeat(43), 'C'.repeat(43), expect.anything());
		expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
	});
});

function createDependencies(ready: boolean): ApiDependencies & { close: ReturnType<typeof vi.fn> } {
	return {
		authService: {} as AuthService,
		credentialService: {} as ApiCredentialService,
		checkReadiness: vi.fn().mockResolvedValue(ready),
		close: vi.fn().mockResolvedValue(undefined)
	};
}
