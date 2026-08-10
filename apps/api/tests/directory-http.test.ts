import { Writable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthService } from '../src/auth/types';
import type { ApiConfig } from '../src/config';
import type { ApiCredentialService } from '../src/credentials/types';
import type { DirectoryRateLimiter } from '../src/directory/rateLimiter';
import type { DirectoryService } from '../src/directory/types';
import { createApiRuntime, type ApiRuntime } from '../src/http/server';
import { createApiLogger } from '../src/logger';
import type { ApiDependencies } from '../src/runtime/dependencies';

const USER = {
	discordUserId: '100000000000000001',
	memberships: [{ divisionCode: 'LGN', divisionName: 'Legionnaire', divisionKind: 'LEGIONNAIRE' as const }],
	totalMerits: 7,
	rankLevel: 3,
	rankSymbol: '③'
};
const AUTHENTICATION = {
	credentialId: '37513880-ac97-4333-b21f-eb919fa07957',
	integrationId: 'd3234d29-3990-412c-a8d3-10db55d9e49f',
	integrationName: 'Directory client',
	prefix: 'AbCdEfGhIjKl',
	scopes: ['users:read' as const]
};
const ALLOWED = { allowed: true, limit: 60, remaining: 59, retryAfterSeconds: 60 };
const config: ApiConfig = {
	nodeEnv: 'test',
	host: '127.0.0.1',
	port: 0,
	logLevel: 'info',
	logFilePath: 'unused.log',
	consoleLogLevel: 'silent',
	bodyLimitBytes: 4_096,
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
		discordClientSecret: 'unused-discord-secret',
		discordCallbackUrl: 'http://127.0.0.1:3000/api/v1/auth/discord/callback',
		allowedOrigins: ['http://127.0.0.1:4173'],
		allowedRedirectUrls: ['http://127.0.0.1:4173/auth/callback'],
		stateTtlSeconds: 600,
		sessionIdleTtlSeconds: 1_800,
		sessionAbsoluteTtlSeconds: 28_800
	},
	redis: { host: 'unused', port: 6379, db: 0, namespace: 'arbiter:api:v1', maxTtlSeconds: 60 },
	directoryRateLimit: { requests: 60, windowSeconds: 60 }
};

describe('credential-authenticated directory HTTP routes', () => {
	let runtime: ApiRuntime | undefined;

	afterEach(async () => {
		await runtime?.stop();
	});

	it('authenticates, scopes, rate-limits, queries, presents, and safely logs direct reads in order', async () => {
		const credentialService = createCredentialService();
		const directoryService = createDirectoryService({ ok: true, value: { users: [USER], nextCursor: null } });
		const rateLimiter = createRateLimiter(ALLOWED);
		let output = '';
		const destination = new Writable({
			write(chunk, _encoding, callback) {
				output += chunk.toString();
				callback();
			}
		});
		const baseUrl = await startRuntime({ credentialService, directoryService, rateLimiter, loggerDestination: destination });

		const response = await fetch(`${baseUrl}/api/v1/users/${USER.discordUserId}`, {
			headers: { authorization: 'Bearer synthetic-secret' }
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('x-ratelimit-limit')).toBe('60');
		expect(response.headers.get('x-ratelimit-remaining')).toBe('59');
		expect(await response.json()).toEqual({ data: USER, meta: { requestId: expect.any(String) } });
		expect(credentialService.authenticate).toHaveBeenCalledWith('synthetic-secret', expect.any(AbortSignal), expect.any(Number));
		expect(rateLimiter.consume).toHaveBeenCalledWith(AUTHENTICATION.credentialId, expect.any(AbortSignal), expect.any(Number));
		expect(directoryService.query).toHaveBeenCalledWith(
			{ discordUserIds: [USER.discordUserId], limit: 1 },
			expect.any(AbortSignal),
			expect.any(Number)
		);
		expect((credentialService.authenticate as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan(
			(rateLimiter.consume as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0] ?? 0
		);
		expect((rateLimiter.consume as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan(
			(directoryService.query as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0] ?? 0
		);
		expect(output).toContain(`"integrationId":"${AUTHENTICATION.integrationId}"`);
		expect(output).toContain(`"credentialPrefix":"${AUTHENTICATION.prefix}"`);
		expect(output).toContain('"route":"/api/v1/users/:discordUserId"');
		expect(output).not.toContain('synthetic-secret');
		expect(output).not.toContain(USER.discordUserId);
	});

	it('maps bounded POST queries and keeps no-match behavior distinct from direct 404s', async () => {
		const directoryService = createDirectoryService({ ok: true, value: { users: [], nextCursor: null } });
		const baseUrl = await startRuntime({ directoryService });
		const query = await fetch(`${baseUrl}/api/v1/users/query`, {
			method: 'POST',
			headers: { authorization: 'Bearer synthetic-secret', 'content-type': 'application/json' },
			body: JSON.stringify({ discordUserIds: [USER.discordUserId], divisionCodesAny: ['LGN'], limit: 25 })
		});
		expect(query.status).toBe(200);
		expect(await query.json()).toEqual({ data: { users: [], nextCursor: null }, meta: { requestId: expect.any(String) } });
		expect(directoryService.query).toHaveBeenCalledWith(
			expect.objectContaining({ discordUserIds: [USER.discordUserId], divisionCodesAny: ['LGN'], limit: 25 }),
			expect.any(AbortSignal),
			expect.any(Number)
		);

		const direct = await fetch(`${baseUrl}/api/v1/users/${USER.discordUserId}`, {
			headers: { authorization: 'Bearer synthetic-secret' }
		});
		expect(direct.status).toBe(404);
		expect(await direct.json()).toMatchObject({ error: { code: 'not_found', message: 'User was not found' } });
	});

	it('returns sanitized authentication and scope failures before rate limiting or lookup', async () => {
		const credentialService = createCredentialService();
		const directoryService = createDirectoryService({ ok: true, value: { users: [USER], nextCursor: null } });
		const rateLimiter = createRateLimiter(ALLOWED);
		const baseUrl = await startRuntime({ credentialService, directoryService, rateLimiter });

		const missing = await fetch(`${baseUrl}/api/v1/users/${USER.discordUserId}`, {
			headers: { cookie: 'arbiter_session=browser-session-does-not-authorize-api-keys' }
		});
		expect(missing.status).toBe(401);
		expect(missing.headers.get('www-authenticate')).toBe('Bearer realm="arbiter-api"');
		expect(await missing.json()).toMatchObject({ error: { code: 'unauthorized', message: 'Invalid API credential' } });
		expect(credentialService.authenticate).not.toHaveBeenCalled();

		(credentialService.authenticate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, error: { code: 'invalid_credential' } });
		const inactive = await fetch(`${baseUrl}/api/v1/users/${USER.discordUserId}`, {
			headers: { authorization: 'Bearer revoked-secret' }
		});
		expect(inactive.status).toBe(401);
		expect(await inactive.json()).toMatchObject({ error: { code: 'unauthorized' } });

		(credentialService.authenticate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			value: { ...AUTHENTICATION, scopes: [] }
		});
		const forbidden = await fetch(`${baseUrl}/api/v1/users/${USER.discordUserId}`, {
			headers: { authorization: 'Bearer unscoped-secret' }
		});
		expect(forbidden.status).toBe(403);
		expect(await forbidden.json()).toMatchObject({ error: { code: 'forbidden' } });
		expect(rateLimiter.consume).not.toHaveBeenCalled();
		expect(directoryService.query).not.toHaveBeenCalled();
	});

	it('enforces input, rate, dependency, and request-time bounds with safe errors', async () => {
		const credentialService = createCredentialService();
		const directoryService = createDirectoryService({ ok: false, error: { code: 'unknown_divisions', divisionCodes: ['MISSING'] } });
		const rateLimiter = createRateLimiter(ALLOWED);
		const baseUrl = await startRuntime({ credentialService, directoryService, rateLimiter });

		const oversizedBatch = await fetch(`${baseUrl}/api/v1/users/query`, {
			method: 'POST',
			headers: { authorization: 'Bearer synthetic-secret', 'content-type': 'application/json' },
			body: JSON.stringify({ discordUserIds: Array.from({ length: 101 }, () => USER.discordUserId) })
		});
		expect(oversizedBatch.status).toBe(400);
		expect(await oversizedBatch.json()).toMatchObject({ error: { code: 'bad_request' } });

		const nullBody = await fetch(`${baseUrl}/api/v1/users/query`, {
			method: 'POST',
			headers: { authorization: 'Bearer synthetic-secret', 'content-type': 'application/json' },
			body: 'null'
		});
		expect(nullBody.status).toBe(400);
		expect(await nullBody.json()).toMatchObject({ error: { code: 'bad_request' } });

		const malformedSnowflake = await fetch(`${baseUrl}/api/v1/users/not-a-snowflake`, {
			headers: { authorization: 'Bearer synthetic-secret' }
		});
		expect(malformedSnowflake.status).toBe(400);
		expect(await malformedSnowflake.json()).toMatchObject({ error: { code: 'bad_request', message: 'Discord user ID is invalid' } });

		const unknown = await fetch(`${baseUrl}/api/v1/users/query`, {
			method: 'POST',
			headers: { authorization: 'Bearer synthetic-secret', 'content-type': 'application/json' },
			body: JSON.stringify({ divisionCodesAny: ['MISSING'] })
		});
		expect(unknown.status).toBe(400);
		expect(await unknown.json()).toMatchObject({ error: { code: 'bad_request', message: 'Unknown division codes: MISSING' } });

		(rateLimiter.consume as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			allowed: false,
			limit: 60,
			remaining: 0,
			retryAfterSeconds: 12
		});
		const limited = await fetch(`${baseUrl}/api/v1/users/${USER.discordUserId}`, {
			headers: { authorization: 'Bearer synthetic-secret' }
		});
		expect(limited.status).toBe(429);
		expect(limited.headers.get('retry-after')).toBe('12');
		expect(await limited.json()).toMatchObject({ error: { code: 'rate_limited' } });

		(rateLimiter.consume as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('redis connection details'));
		const unavailable = await fetch(`${baseUrl}/api/v1/users/${USER.discordUserId}`, {
			headers: { authorization: 'Bearer synthetic-secret' }
		});
		expect(unavailable.status).toBe(503);
		expect(await unavailable.json()).toMatchObject({ error: { code: 'service_unavailable', message: 'Directory service is unavailable' } });
	});

	it('aborts credential work when the request deadline expires', async () => {
		const credentialService = createCredentialService();
		(credentialService.authenticate as ReturnType<typeof vi.fn>).mockImplementation(
			(_secret: string, signal?: AbortSignal) =>
				new Promise((_resolve, reject) => {
					if (signal?.aborted) return reject(signal.reason);
					signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
				})
		);
		const baseUrl = await startRuntime({ credentialService, runtimeConfig: { ...config, requestTimeoutMs: 20 } });
		const response = await fetch(`${baseUrl}/api/v1/users/${USER.discordUserId}`, {
			headers: { authorization: 'Bearer synthetic-secret' }
		});
		expect(response.status).toBe(408);
		expect(await response.json()).toMatchObject({ error: { code: 'request_timeout' } });
	});

	async function startRuntime({
		credentialService = createCredentialService(),
		directoryService = createDirectoryService({ ok: true, value: { users: [USER], nextCursor: null } }),
		rateLimiter = createRateLimiter(ALLOWED),
		runtimeConfig = config,
		loggerDestination
	}: {
		credentialService?: ApiCredentialService;
		directoryService?: DirectoryService;
		rateLimiter?: DirectoryRateLimiter;
		runtimeConfig?: ApiConfig;
		loggerDestination?: Writable;
	} = {}) {
		const dependencies: ApiDependencies = {
			authService: {} as AuthService,
			credentialService,
			directoryService,
			directoryRateLimiter: rateLimiter,
			checkReadiness: vi.fn().mockResolvedValue(true),
			close: vi.fn().mockResolvedValue(undefined)
		};
		const logger = createApiLogger(runtimeConfig, loggerDestination);
		runtime = createApiRuntime({ config: runtimeConfig, dependencies, logger });
		const address = await runtime.start();
		return `http://127.0.0.1:${address.port}`;
	}
});

function createCredentialService(): ApiCredentialService {
	return {
		authenticate: vi.fn().mockResolvedValue({ ok: true, value: AUTHENTICATION })
	} as unknown as ApiCredentialService;
}

function createDirectoryService(result: Awaited<ReturnType<DirectoryService['query']>>): DirectoryService {
	return { query: vi.fn().mockResolvedValue(result) };
}

function createRateLimiter(result: Awaited<ReturnType<DirectoryRateLimiter['consume']>>): DirectoryRateLimiter {
	return { consume: vi.fn().mockResolvedValue(result) };
}
