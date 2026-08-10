import type { IncomingMessage, ServerResponse } from 'node:http';

import { API_V1_ROUTES, ApiDirectoryQuerySchema, DiscordUserIdSchema, type ApiScope } from '@arbiter/api-contracts';

import type { ApiCredentialService } from '../credentials/types';
import { ApiHttpError } from '../http/errors';
import type { DirectoryRateLimitDecision, DirectoryRateLimiter } from './rateLimiter';
import type { DirectoryService, DirectoryServiceResult } from './types';

export type DirectoryRequestLogContext = {
	route?: string;
	integrationId?: string;
	credentialPrefix?: string;
};

export async function handleDirectoryHttpRequest({
	request,
	response,
	url,
	requestId,
	body,
	credentialService,
	directoryService,
	rateLimiter,
	logContext,
	deadlineAtMs,
	signal
}: {
	request: IncomingMessage;
	response: ServerResponse;
	url: URL;
	requestId: string;
	body: unknown;
	credentialService: ApiCredentialService;
	directoryService: DirectoryService;
	rateLimiter: DirectoryRateLimiter;
	logContext: DirectoryRequestLogContext;
	deadlineAtMs: number;
	signal: AbortSignal;
}): Promise<boolean> {
	const route = parseDirectoryRoute(url.pathname);
	if (!route) return false;
	logContext.route = route.kind === 'direct' ? `${API_V1_ROUTES.directoryUsers}/:discordUserId` : API_V1_ROUTES.directoryQuery;
	requireNoQuery(url);
	requireMethod(request, response, route.kind === 'direct' ? ['GET'] : ['POST']);

	const secret = parseBearerCredential(request.headers.authorization);
	if (!secret) throw unauthorized(response);
	const authentication = await callCredentialAuthentication(() => credentialService.authenticate(secret, signal, deadlineAtMs), signal);
	if (!authentication.ok) {
		if (authentication.error.code === 'invalid_credential') throw unauthorized(response);
		throw new ApiHttpError(503, 'service_unavailable', 'Directory service is unavailable');
	}
	logContext.integrationId = authentication.value.integrationId;
	logContext.credentialPrefix = authentication.value.prefix;
	if (!hasScope(authentication.value.scopes, 'users:read')) {
		throw new ApiHttpError(403, 'forbidden', 'API credential does not permit user reads');
	}

	const rate = await callRateLimiter(() => rateLimiter.consume(authentication.value.credentialId, signal, deadlineAtMs), signal, deadlineAtMs);
	writeRateLimitHeaders(response, rate);
	if (!rate.allowed) {
		response.setHeader('retry-after', String(rate.retryAfterSeconds));
		throw new ApiHttpError(429, 'rate_limited', 'API credential rate limit exceeded');
	}

	if (route.kind === 'direct') {
		const result = await callDirectory(
			() => directoryService.query({ discordUserIds: [route.discordUserId], limit: 1 }, signal, deadlineAtMs),
			signal,
			deadlineAtMs
		);
		if (!result.ok) throw toDirectoryHttpError(result);
		const user = result.value.users[0];
		if (!user) throw new ApiHttpError(404, 'not_found', 'User was not found');
		writeJson(response, 200, { data: user, meta: { requestId } });
		return true;
	}

	const input = ApiDirectoryQuerySchema.safeParse(body === undefined ? {} : body);
	if (!input.success) throw new ApiHttpError(400, 'bad_request', 'Directory query is invalid');
	const result = await callDirectory(() => directoryService.query(input.data, signal, deadlineAtMs), signal, deadlineAtMs);
	if (!result.ok) throw toDirectoryHttpError(result);
	writeJson(response, 200, { data: result.value, meta: { requestId } });
	return true;
}

function parseDirectoryRoute(pathname: string): { kind: 'direct'; discordUserId: string } | { kind: 'query' } | null {
	if (pathname === API_V1_ROUTES.directoryQuery) return { kind: 'query' };
	if (!pathname.startsWith(`${API_V1_ROUTES.directoryUsers}/`)) return null;
	const suffix = pathname.slice(API_V1_ROUTES.directoryUsers.length + 1);
	if (suffix.includes('/')) throw new ApiHttpError(404, 'not_found', 'Route not found');
	const discordUserId = DiscordUserIdSchema.safeParse(suffix);
	if (!discordUserId.success) throw new ApiHttpError(400, 'bad_request', 'Discord user ID is invalid');
	return { kind: 'direct', discordUserId: discordUserId.data };
}

function parseBearerCredential(header: string | string[] | undefined): string | null {
	if (typeof header !== 'string') return null;
	const match = /^Bearer ([A-Za-z0-9_-]+)$/i.exec(header);
	return match?.[1] ?? null;
}

function hasScope(scopes: readonly ApiScope[], required: ApiScope): boolean {
	return scopes.includes(required);
}

function unauthorized(response: ServerResponse): ApiHttpError {
	response.setHeader('www-authenticate', 'Bearer realm="arbiter-api"');
	return new ApiHttpError(401, 'unauthorized', 'Invalid API credential');
}

function requireNoQuery(url: URL): void {
	if ([...url.searchParams.keys()].length > 0) throw new ApiHttpError(400, 'bad_request', 'Directory routes do not accept URL query parameters');
}

function requireMethod(request: IncomingMessage, response: ServerResponse, allowed: readonly string[]): void {
	if (request.method && allowed.includes(request.method)) return;
	response.setHeader('allow', allowed.join(', '));
	throw new ApiHttpError(405, 'method_not_allowed', 'Method not allowed');
}

async function callCredentialAuthentication<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
	try {
		const result = await operation();
		signal.throwIfAborted();
		return result;
	} catch {
		signal.throwIfAborted();
		throw new ApiHttpError(503, 'service_unavailable', 'Directory service is unavailable');
	}
}

async function callRateLimiter(
	operation: () => Promise<DirectoryRateLimitDecision>,
	signal: AbortSignal,
	deadlineAtMs: number
): Promise<DirectoryRateLimitDecision> {
	try {
		const result = await operation();
		signal.throwIfAborted();
		return result;
	} catch {
		signal.throwIfAborted();
		if (Date.now() >= deadlineAtMs) throw new ApiHttpError(408, 'request_timeout', 'Request timed out');
		throw new ApiHttpError(503, 'service_unavailable', 'Directory service is unavailable');
	}
}

async function callDirectory(
	operation: () => Promise<DirectoryServiceResult>,
	signal: AbortSignal,
	deadlineAtMs: number
): Promise<DirectoryServiceResult> {
	try {
		const result = await operation();
		signal.throwIfAborted();
		return result;
	} catch {
		signal.throwIfAborted();
		if (Date.now() >= deadlineAtMs) throw new ApiHttpError(408, 'request_timeout', 'Request timed out');
		throw new ApiHttpError(503, 'service_unavailable', 'Directory service is unavailable');
	}
}

function toDirectoryHttpError(result: Extract<DirectoryServiceResult, { ok: false }>): ApiHttpError {
	if (result.error.code === 'unknown_divisions') {
		return new ApiHttpError(400, 'bad_request', `Unknown division codes: ${result.error.divisionCodes.join(', ')}`);
	}
	return new ApiHttpError(400, 'bad_request', 'Directory query is invalid');
}

function writeRateLimitHeaders(response: ServerResponse, rate: DirectoryRateLimitDecision): void {
	response.setHeader('x-ratelimit-limit', String(rate.limit));
	response.setHeader('x-ratelimit-remaining', String(rate.remaining));
	response.setHeader('x-ratelimit-reset-after', String(rate.retryAfterSeconds));
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
	if (response.writableEnded) return;
	const body = JSON.stringify(payload);
	response.statusCode = statusCode;
	response.setHeader('content-type', 'application/json; charset=utf-8');
	response.setHeader('content-length', Buffer.byteLength(body));
	response.end(body);
}
