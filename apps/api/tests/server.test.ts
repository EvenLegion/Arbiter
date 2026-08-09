import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiConfig } from '../src/config';
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
});

function createDependencies(ready: boolean): ApiDependencies & { close: ReturnType<typeof vi.fn> } {
	return {
		credentialService: {} as ApiCredentialService,
		checkReadiness: vi.fn().mockResolvedValue(ready),
		close: vi.fn().mockResolvedValue(undefined)
	};
}
