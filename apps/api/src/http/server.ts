import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { API_V1_ROUTES, RequestIdSchema } from '@arbiter/api-contracts';
import type { Logger } from 'pino';

import type { ApiConfig } from '../config';
import { handleAuthHttpRequest } from '../auth/http';
import { handleIntegrationHttpRequest } from '../integrations/http';
import type { ApiDependencies } from '../runtime/dependencies';
import { handleDirectoryHttpRequest, type DirectoryRequestLogContext } from '../directory/http';
import { applyExactOriginCors, writeCorsPreflight } from './cors';
import { ApiHttpError, createErrorEnvelope, toApiError } from './errors';
import { readJsonRequestBody } from './request';

export type ApiRuntime = {
	start: () => Promise<{ host: string; port: number }>;
	stop: () => Promise<void>;
};

export function createApiRuntime({ config, dependencies, logger }: { config: ApiConfig; dependencies: ApiDependencies; logger: Logger }): ApiRuntime {
	const server = createServer((request, response) => {
		void handleRequest({ request, response, config, dependencies, logger });
	});
	server.requestTimeout = 0;
	server.headersTimeout = config.headersTimeoutMs;
	server.keepAliveTimeout = config.keepAliveTimeoutMs;
	server.maxHeadersCount = 100;

	server.on('clientError', (error, socket) => {
		const requestId = randomUUID();
		const timedOut = (error as NodeJS.ErrnoException).code === 'ERR_HTTP_REQUEST_TIMEOUT';
		const apiError = timedOut
			? new ApiHttpError(408, 'request_timeout', 'Request timed out')
			: new ApiHttpError(400, 'bad_request', 'Bad request');
		const body = JSON.stringify(createErrorEnvelope(apiError, requestId));
		socket.end(
			`HTTP/1.1 ${apiError.statusCode} ${timedOut ? 'Request Timeout' : 'Bad Request'}\r\nContent-Type: application/json; charset=utf-8\r\nX-Request-Id: ${requestId}\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`
		);
	});

	let stopPromise: Promise<void> | undefined;
	return {
		start: async () => {
			await new Promise<void>((resolve, reject) => {
				server.once('error', reject);
				server.listen(config.port, config.host, () => {
					server.removeListener('error', reject);
					resolve();
				});
			});
			const address = server.address() as AddressInfo;
			return { host: address.address, port: address.port };
		},
		stop: () => {
			stopPromise ??= stopRuntime(server, dependencies, config.shutdownTimeoutMs);
			return stopPromise;
		}
	};
}

async function handleRequest({
	request,
	response,
	config,
	dependencies,
	logger
}: {
	request: IncomingMessage;
	response: ServerResponse;
	config: ApiConfig;
	dependencies: ApiDependencies;
	logger: Logger;
}) {
	const startedAt = performance.now();
	const requestDeadlineAtMs = Date.now() + config.requestTimeoutMs;
	const requestId = resolveRequestId(request.headers['x-request-id']);
	response.setHeader('x-request-id', requestId);
	response.setHeader('content-type', 'application/json; charset=utf-8');
	response.setHeader('cache-control', 'no-store');
	response.setHeader('referrer-policy', 'no-referrer');
	response.setHeader('x-content-type-options', 'nosniff');
	let requestTimedOut = false;
	let clientDisconnected = false;
	const requestAbortController = new AbortController();
	const abortForDisconnect = () => {
		if (response.writableFinished || requestAbortController.signal.aborted) return;
		clientDisconnected = true;
		requestAbortController.abort(new Error('Client disconnected'));
	};
	request.once('aborted', abortForDisconnect);
	response.once('close', abortForDisconnect);
	const requestTimeout = setTimeout(() => {
		requestTimedOut = true;
		requestAbortController.abort(new ApiHttpError(408, 'request_timeout', 'Request timed out'));
		response.setHeader('connection', 'close');
		writeJson(
			response,
			408,
			createErrorEnvelope(new ApiHttpError(408, 'request_timeout', 'Request timed out'), requestId),
			request.method === 'HEAD'
		);
		request.resume();
	}, config.requestTimeoutMs);

	let path = '/';
	const directoryLogContext: DirectoryRequestLogContext = {};
	try {
		const url = new URL(request.url ?? '/', 'http://arbiter-api.local');
		path = url.pathname;
		applyExactOriginCors(request, response, config.auth.allowedOrigins);
		if (request.method === 'OPTIONS') {
			writeCorsPreflight(response);
			return;
		}
		const body = await readJsonRequestBody(request, config.bodyLimitBytes);
		if (requestTimedOut) return;
		if (
			await handleDirectoryHttpRequest({
				request,
				response,
				url,
				requestId,
				body,
				credentialService: dependencies.credentialService,
				directoryService: dependencies.directoryService,
				rateLimiter: dependencies.directoryRateLimiter,
				logContext: directoryLogContext,
				deadlineAtMs: requestDeadlineAtMs,
				signal: requestAbortController.signal
			})
		)
			return;
		if (
			await handleAuthHttpRequest({
				request,
				response,
				url,
				requestId,
				body,
				config,
				authService: dependencies.authService,
				signal: requestAbortController.signal
			})
		)
			return;
		if (
			await handleIntegrationHttpRequest({
				request,
				response,
				url,
				requestId,
				body,
				config,
				authService: dependencies.authService,
				credentialService: dependencies.credentialService,
				signal: requestAbortController.signal
			})
		)
			return;

		if (path === API_V1_ROUTES.health) {
			requireReadMethod(request, response);
			writeJson(response, 200, { data: { status: 'ok' }, meta: { requestId } }, request.method === 'HEAD');
			return;
		}
		if (path === API_V1_ROUTES.readiness) {
			requireReadMethod(request, response);
			const ready = await dependencies.checkReadiness(config.readinessTimeoutMs);
			writeJson(
				response,
				ready ? 200 : 503,
				{ data: { status: ready ? 'ready' : 'not_ready' }, meta: { requestId } },
				request.method === 'HEAD'
			);
			return;
		}

		throw new ApiHttpError(404, 'not_found', 'Route not found');
	} catch (error) {
		if (requestTimedOut || clientDisconnected || response.destroyed) return;
		const apiError = toApiError(error);
		if (apiError.statusCode >= 500) {
			logger.error({ requestId, errorName: error instanceof Error ? error.name : 'UnknownError' }, 'API request failed');
		}
		writeJson(response, apiError.statusCode, createErrorEnvelope(apiError, requestId), request.method === 'HEAD');
	} finally {
		clearTimeout(requestTimeout);
		request.removeListener('aborted', abortForDisconnect);
		response.removeListener('close', abortForDisconnect);
		logger.info(
			{
				requestId,
				method: request.method,
				path: directoryLogContext.route ?? path,
				route: directoryLogContext.route ?? path,
				integrationId: directoryLogContext.integrationId,
				credentialPrefix: directoryLogContext.credentialPrefix,
				statusCode: clientDisconnected ? 499 : response.statusCode,
				durationMs: Math.round((performance.now() - startedAt) * 100) / 100
			},
			'API request completed'
		);
	}
}

function requireReadMethod(request: IncomingMessage, response: ServerResponse): void {
	if (request.method === 'GET' || request.method === 'HEAD') return;
	response.setHeader('allow', 'GET, HEAD');
	throw new ApiHttpError(405, 'method_not_allowed', 'Method not allowed');
}

function resolveRequestId(header: string | string[] | undefined): string {
	if (typeof header === 'string') {
		const parsed = RequestIdSchema.safeParse(header);
		if (parsed.success) return parsed.data;
	}
	return randomUUID();
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown, headOnly = false) {
	if (response.writableEnded) return;
	const body = JSON.stringify(payload);
	response.statusCode = statusCode;
	response.setHeader('content-length', Buffer.byteLength(body));
	response.end(headOnly ? undefined : body);
}

async function stopRuntime(server: Server, dependencies: ApiDependencies, timeoutMs: number): Promise<void> {
	let timeout: NodeJS.Timeout | undefined;
	try {
		await Promise.race([
			(async () => {
				if (server.listening) {
					await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
				}
				await dependencies.close();
			})(),
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => {
					server.closeAllConnections();
					reject(new Error('API shutdown timed out'));
				}, timeoutMs);
			})
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
