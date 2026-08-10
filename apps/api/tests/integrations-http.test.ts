import type { ApiAuthIdentity, ApiCredentialMetadata, ApiIntegrationRegistryItem } from '@arbiter/api-contracts';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthFailure, type AuthService } from '../src/auth/types';
import type { ApiConfig } from '../src/config';
import type { ApiCredentialService } from '../src/credentials/types';
import type { DirectoryService } from '../src/directory/types';
import { createApiRuntime, type ApiRuntime } from '../src/http/server';
import type { ApiDependencies } from '../src/runtime/dependencies';

const ORIGIN = 'http://127.0.0.1:4173';
const SESSION_ID = 'S'.repeat(43);
const CSRF_TOKEN = 'C'.repeat(43);
const IDENTITY: ApiAuthIdentity = {
	userId: '33b20a61-1e86-4115-b999-f319808d5a87',
	discordUserId: '100000000000000001',
	discordUsername: 'staff-user',
	discordNickname: 'Staff User',
	discordAvatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
	role: 'STAFF'
};
const INTEGRATION: ApiIntegrationRegistryItem = {
	id: 'd3234d29-3990-412c-a8d3-10db55d9e49f',
	name: 'Directory client',
	purpose: 'Read canonical member data',
	state: 'active',
	createdByUserId: IDENTITY.userId,
	updatedByUserId: IDENTITY.userId,
	archivedByUserId: null,
	archivedAt: null,
	createdAt: '2026-08-09T08:00:00.000Z',
	updatedAt: '2026-08-09T08:00:00.000Z',
	creator: {
		userId: IDENTITY.userId,
		discordUsername: IDENTITY.discordUsername,
		discordNickname: IDENTITY.discordNickname
	},
	credentialCount: 2
};
const CREDENTIAL: ApiCredentialMetadata = {
	id: '37513880-ac97-4333-b21f-eb919fa07957',
	integrationId: INTEGRATION.id,
	label: 'Portal reader',
	prefix: 'AbCdEfGhIjKl',
	scopes: ['users:read'],
	status: 'active',
	createdByUserId: IDENTITY.userId,
	creator: {
		userId: IDENTITY.userId,
		discordUsername: IDENTITY.discordUsername,
		discordNickname: IDENTITY.discordNickname
	},
	expiresAt: '2027-08-09T08:00:00.000Z',
	revokedByUserId: null,
	revokedAt: null,
	lastUsedAt: null,
	createdAt: '2026-08-09T08:00:00.000Z',
	updatedAt: '2026-08-09T08:00:00.000Z'
};
const ONE_TIME_SECRET = 'arb_v1_AbCdEfGhIjKl_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789';
const config: ApiConfig = {
	nodeEnv: 'test',
	host: '127.0.0.1',
	port: 0,
	logLevel: 'silent',
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
		discordClientSecret: 'unused',
		discordCallbackUrl: 'http://127.0.0.1:3000/api/v1/auth/discord/callback',
		allowedOrigins: [ORIGIN],
		allowedRedirectUrls: [`${ORIGIN}/auth/callback`],
		stateTtlSeconds: 600,
		sessionIdleTtlSeconds: 1_800,
		sessionAbsoluteTtlSeconds: 28_800
	},
	redis: { host: 'unused', port: 6379, db: 0, namespace: 'arbiter:api:v1', maxTtlSeconds: 60 },
	directoryRateLimit: { requests: 60, windowSeconds: 60 }
};

describe('integration registry HTTP routes', () => {
	let runtime: ApiRuntime | undefined;

	afterEach(async () => {
		await runtime?.stop();
	});

	it('lists safe registry items for an authenticated staff session', async () => {
		const { baseUrl, credentialService, authService } = await startRuntime();
		const response = await fetch(`${baseUrl}/api/v1/integrations?includeArchived=true`, {
			headers: browserHeaders()
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
		expect(await response.json()).toMatchObject({ data: { integrations: [INTEGRATION] }, meta: { requestId: expect.any(String) } });
		expect(authService.requireSession).toHaveBeenCalledWith(SESSION_ID, expect.any(AbortSignal));
		expect(credentialService.listIntegrations).toHaveBeenCalledWith({ userId: IDENTITY.userId, role: 'STAFF' }, true);
	});

	it('requires session-bound CSRF for create and returns typed conflicts', async () => {
		const authService = createAuthService();
		(authService.requireMutationSession as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new AuthFailure('csrf_failed'));
		const { baseUrl, credentialService } = await startRuntime({ authService });
		const denied = await fetch(`${baseUrl}/api/v1/integrations`, {
			method: 'POST',
			headers: browserHeaders({ 'content-type': 'application/json' }),
			body: JSON.stringify({ name: 'Portal client', purpose: 'Manage members' })
		});
		expect(denied.status).toBe(403);
		expect(await denied.json()).toMatchObject({ error: { code: 'csrf_failed' } });
		expect(credentialService.createIntegration).not.toHaveBeenCalled();

		(credentialService.createIntegration as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, error: { code: 'conflict' } });
		const conflict = await fetch(`${baseUrl}/api/v1/integrations`, {
			method: 'POST',
			headers: browserHeaders({ 'content-type': 'application/json', 'x-csrf-token': CSRF_TOKEN }),
			body: JSON.stringify({ name: 'Portal client', purpose: 'Manage members' })
		});
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toMatchObject({ error: { code: 'conflict' } });
	});

	it('lists only safe credential metadata and returns a minted secret only from the CSRF-protected mint response', async () => {
		const { baseUrl, credentialService, authService } = await startRuntime();
		const listResponse = await fetch(`${baseUrl}/api/v1/integrations/${INTEGRATION.id}/credentials`, {
			headers: browserHeaders()
		});
		const listed = await listResponse.json();
		expect(listResponse.status).toBe(200);
		expect(listed).toMatchObject({ data: { credentials: [CREDENTIAL] } });
		expect(JSON.stringify(listed)).not.toContain('secret');
		expect(JSON.stringify(listed)).not.toContain('verifier');
		expect(authService.requireSession).toHaveBeenCalled();

		const mintResponse = await fetch(`${baseUrl}/api/v1/integrations/${INTEGRATION.id}/credentials`, {
			method: 'POST',
			headers: browserHeaders({ 'content-type': 'application/json', 'x-csrf-token': CSRF_TOKEN }),
			body: JSON.stringify({ label: CREDENTIAL.label, scopes: ['users:read'] })
		});
		expect(mintResponse.status).toBe(201);
		expect(await mintResponse.json()).toMatchObject({ data: { credential: CREDENTIAL, secret: ONE_TIME_SECRET } });
		expect(credentialService.mintCredential).toHaveBeenCalledWith(
			{ userId: IDENTITY.userId, role: 'STAFF' },
			expect.objectContaining({ integrationId: INTEGRATION.id, label: CREDENTIAL.label, scopes: ['users:read'] }),
			expect.any(AbortSignal)
		);
	});

	it('routes idempotent revocation through the API-authoritative creator and EXEC policy', async () => {
		const { baseUrl, credentialService } = await startRuntime();
		const response = await fetch(`${baseUrl}/api/v1/integrations/${INTEGRATION.id}/credentials/${CREDENTIAL.id}/revoke`, {
			method: 'POST',
			headers: browserHeaders({ 'x-csrf-token': CSRF_TOKEN })
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ data: { id: CREDENTIAL.id, status: 'revoked' } });
		expect(credentialService.revokeCredential).toHaveBeenCalledWith(
			{ userId: IDENTITY.userId, role: 'STAFF' },
			CREDENTIAL.id,
			INTEGRATION.id,
			expect.any(AbortSignal)
		);
	});

	it('propagates request cancellation into registry mutations', async () => {
		let mutationSignal: AbortSignal | undefined;
		const credentialService = createCredentialService();
		credentialService.createIntegration = vi.fn().mockImplementation(
			(_actor, _input, signal: AbortSignal | undefined) =>
				new Promise((_resolve, reject) => {
					mutationSignal = signal;
					if (signal?.aborted) {
						reject(signal.reason);
						return;
					}
					signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
				})
		);
		const { baseUrl } = await startRuntime({ credentialService, config: { ...config, requestTimeoutMs: 20 } });
		const response = await fetch(`${baseUrl}/api/v1/integrations`, {
			method: 'POST',
			headers: browserHeaders({ 'content-type': 'application/json', 'x-csrf-token': CSRF_TOKEN }),
			body: JSON.stringify({ name: 'Portal client', purpose: 'Manage members' })
		});

		expect(response.status).toBe(408);
		expect(await response.json()).toMatchObject({ error: { code: 'request_timeout' } });
		expect(mutationSignal?.aborted).toBe(true);
	});

	it('surfaces forbidden and stale mutations and archives through POST only', async () => {
		const { baseUrl, credentialService } = await startRuntime();
		(credentialService.editIntegration as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, error: { code: 'stale' } });
		const stale = await fetch(`${baseUrl}/api/v1/integrations/${INTEGRATION.id}`, {
			method: 'PATCH',
			headers: browserHeaders({ 'content-type': 'application/json', 'x-csrf-token': CSRF_TOKEN }),
			body: JSON.stringify({ name: INTEGRATION.name, purpose: INTEGRATION.purpose, expectedUpdatedAt: INTEGRATION.updatedAt })
		});
		expect(stale.status).toBe(409);
		expect(await stale.json()).toMatchObject({ error: { code: 'stale' } });

		(credentialService.archiveIntegration as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, error: { code: 'forbidden' } });
		const forbidden = await fetch(`${baseUrl}/api/v1/integrations/${INTEGRATION.id}/archive`, {
			method: 'POST',
			headers: browserHeaders({ 'content-type': 'application/json', 'x-csrf-token': CSRF_TOKEN }),
			body: JSON.stringify({ expectedUpdatedAt: INTEGRATION.updatedAt })
		});
		expect(forbidden.status).toBe(403);
		expect(await forbidden.json()).toMatchObject({ error: { code: 'forbidden' } });

		const getAttempt = await fetch(`${baseUrl}/api/v1/integrations/${INTEGRATION.id}/archive`, { headers: browserHeaders() });
		expect(getAttempt.status).toBe(405);
	});

	it('fails closed for unauthenticated and unlisted-origin requests', async () => {
		const authService = createAuthService();
		(authService.requireSession as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new AuthFailure('unauthorized'));
		const { baseUrl, credentialService } = await startRuntime({ authService });
		const unauthenticated = await fetch(`${baseUrl}/api/v1/integrations`, { headers: browserHeaders() });
		expect(unauthenticated.status).toBe(401);

		const unlisted = await fetch(`${baseUrl}/api/v1/integrations`, { headers: { origin: 'https://unlisted.example' } });
		expect(unlisted.status).toBe(403);
		expect(credentialService.listIntegrations).not.toHaveBeenCalled();
	});

	async function startRuntime(overrides: { authService?: AuthService; credentialService?: ApiCredentialService; config?: ApiConfig } = {}) {
		const authService = overrides.authService ?? createAuthService();
		const credentialService = overrides.credentialService ?? createCredentialService();
		const dependencies: ApiDependencies = {
			authService,
			credentialService,
			directoryService: {} as DirectoryService,
			directoryRateLimiter: { consume: vi.fn() },
			checkReadiness: vi.fn().mockResolvedValue(true),
			close: vi.fn().mockResolvedValue(undefined)
		};
		runtime = createApiRuntime({ config: overrides.config ?? config, dependencies, logger: pino({ level: 'silent' }) });
		const address = await runtime.start();
		return { baseUrl: `http://127.0.0.1:${address.port}`, credentialService, authService };
	}
});

function createAuthService(): AuthService {
	const session = {
		identity: IDENTITY,
		csrfToken: CSRF_TOKEN,
		idleExpiresAt: '2026-08-09T18:30:00.000Z',
		absoluteExpiresAt: '2026-08-10T02:00:00.000Z'
	};
	return {
		beginOAuth: vi.fn(),
		completeOAuth: vi.fn(),
		requireSession: vi.fn().mockResolvedValue(session),
		requireMutationSession: vi.fn().mockResolvedValue(session),
		logout: vi.fn()
	};
}

function createCredentialService(): ApiCredentialService {
	return {
		createIntegration: vi.fn().mockResolvedValue({ ok: true, value: INTEGRATION }),
		listIntegrations: vi.fn().mockResolvedValue({ ok: true, value: [INTEGRATION] }),
		editIntegration: vi.fn().mockResolvedValue({ ok: true, value: INTEGRATION }),
		archiveIntegration: vi.fn().mockResolvedValue({ ok: true, value: { ...INTEGRATION, state: 'archived' } }),
		listCredentials: vi.fn().mockResolvedValue({ ok: true, value: [CREDENTIAL] }),
		authenticate: vi.fn(),
		mintCredential: vi.fn().mockResolvedValue({ ok: true, value: { credential: CREDENTIAL, secret: ONE_TIME_SECRET } }),
		revokeCredential: vi.fn().mockResolvedValue({
			ok: true,
			value: { ...CREDENTIAL, status: 'revoked', revokedAt: '2026-08-10T08:00:00.000Z' }
		})
	};
}

function browserHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return { origin: ORIGIN, cookie: `arbiter_session=${SESSION_ID}`, ...extra };
}
