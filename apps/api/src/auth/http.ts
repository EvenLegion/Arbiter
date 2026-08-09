import type { IncomingMessage, ServerResponse } from 'node:http';

import { API_V1_ROUTES, OAuthStartRequestSchema } from '@arbiter/api-contracts';

import type { ApiConfig } from '../config';
import { ApiHttpError } from '../http/errors';
import { AuthFailure, type AuthService } from './types';

const OAUTH_BINDING_COOKIE = 'arbiter_oauth_binding';
const SESSION_COOKIE = 'arbiter_session';
const AUTH_ROUTES = new Set<string>([
	API_V1_ROUTES.authDiscordStart,
	API_V1_ROUTES.authDiscordCallback,
	API_V1_ROUTES.authSession,
	API_V1_ROUTES.authIdentity,
	API_V1_ROUTES.authLogout
]);

export async function handleAuthHttpRequest({
	request,
	response,
	url,
	requestId,
	body,
	config,
	authService
}: {
	request: IncomingMessage;
	response: ServerResponse;
	url: URL;
	requestId: string;
	body: unknown;
	config: ApiConfig;
	authService: AuthService;
}): Promise<boolean> {
	if (!AUTH_ROUTES.has(url.pathname)) return false;
	const cookies = parseCookies(request.headers.cookie);

	try {
		if (url.pathname === API_V1_ROUTES.authDiscordStart) {
			requireMethod(request, response, ['POST']);
			const input = OAuthStartRequestSchema.safeParse(body);
			if (!input.success) throw new ApiHttpError(400, 'bad_request', 'Invalid OAuth start request');
			const started = await authService.beginOAuth({ redirectUri: input.data.redirectUri, bindingId: cookies[OAUTH_BINDING_COOKIE] });
			response.setHeader('set-cookie', serializeCookie(OAUTH_BINDING_COOKIE, started.bindingId, oauthBindingCookieOptions(config)));
			writeJson(response, 200, { data: { authorizationUrl: started.authorizationUrl }, meta: { requestId } });
			return true;
		}

		if (url.pathname === API_V1_ROUTES.authDiscordCallback) {
			requireMethod(request, response, ['GET']);
			response.setHeader('set-cookie', serializeCookie(OAUTH_BINDING_COOKIE, '', { ...oauthBindingCookieOptions(config), maxAge: 0 }));
			const code = url.searchParams.get('code');
			const state = url.searchParams.get('state');
			if (!code || !state) throw new AuthFailure('invalid_oauth_state');
			const completed = await authService.completeOAuth({
				code,
				state,
				bindingId: cookies[OAUTH_BINDING_COOKIE],
				existingSessionId: cookies[SESSION_COOKIE]
			});
			response.setHeader('set-cookie', [
				serializeCookie(OAUTH_BINDING_COOKIE, '', { ...oauthBindingCookieOptions(config), maxAge: 0 }),
				serializeCookie(SESSION_COOKIE, completed.sessionId, sessionCookieOptions(config))
			]);
			writeRedirect(response, completed.redirectUri);
			return true;
		}

		if (url.pathname === API_V1_ROUTES.authSession) {
			requireMethod(request, response, ['GET']);
			const sessionId = cookies[SESSION_COOKIE];
			const session = await authService.requireSession(sessionId);
			if (sessionId) response.setHeader('set-cookie', serializeCookie(SESSION_COOKIE, sessionId, sessionCookieOptions(config)));
			writeJson(response, 200, {
				data: {
					authenticated: true,
					csrfToken: session.csrfToken,
					idleExpiresAt: session.idleExpiresAt,
					absoluteExpiresAt: session.absoluteExpiresAt
				},
				meta: { requestId }
			});
			return true;
		}

		if (url.pathname === API_V1_ROUTES.authIdentity) {
			requireMethod(request, response, ['GET']);
			const sessionId = cookies[SESSION_COOKIE];
			const session = await authService.requireSession(sessionId);
			if (sessionId) response.setHeader('set-cookie', serializeCookie(SESSION_COOKIE, sessionId, sessionCookieOptions(config)));
			writeJson(response, 200, { data: session.identity, meta: { requestId } });
			return true;
		}

		requireMethod(request, response, ['POST']);
		await authService.logout(cookies[SESSION_COOKIE], singleHeader(request.headers['x-csrf-token']));
		response.setHeader('set-cookie', serializeCookie(SESSION_COOKIE, '', { ...sessionCookieOptions(config), maxAge: 0 }));
		writeJson(response, 200, { data: { loggedOut: true }, meta: { requestId } });
		return true;
	} catch (error) {
		if (error instanceof AuthFailure) throw toAuthHttpError(error);
		throw error;
	}
}

function toAuthHttpError(error: AuthFailure): ApiHttpError {
	switch (error.code) {
		case 'invalid_oauth_state':
			return new ApiHttpError(400, error.code, 'OAuth state is invalid or expired');
		case 'invalid_redirect':
			return new ApiHttpError(400, error.code, 'Redirect is not allowed');
		case 'oauth_failed':
			return new ApiHttpError(502, error.code, 'Discord authentication failed');
		case 'unauthorized':
			return new ApiHttpError(401, error.code, 'Authentication required');
		case 'forbidden':
			return new ApiHttpError(403, error.code, 'Staff access required');
		case 'csrf_failed':
			return new ApiHttpError(403, error.code, 'CSRF validation failed');
		case 'service_unavailable':
			return new ApiHttpError(503, error.code, 'Authentication service unavailable');
	}
}

function requireMethod(request: IncomingMessage, response: ServerResponse, allowed: readonly string[]): void {
	if (request.method && allowed.includes(request.method)) return;
	response.setHeader('allow', allowed.join(', '));
	throw new ApiHttpError(405, 'method_not_allowed', 'Method not allowed');
}

function parseCookies(header: string | undefined): Record<string, string> {
	if (!header) return {};
	const result: Record<string, string> = {};
	for (const item of header.split(';')) {
		const separator = item.indexOf('=');
		if (separator <= 0) continue;
		const name = item.slice(0, separator).trim();
		const value = item.slice(separator + 1).trim();
		if (/^[A-Za-z0-9_-]+$/.test(name) && /^[A-Za-z0-9_-]*$/.test(value)) result[name] = value;
	}
	return result;
}

function serializeCookie(name: string, value: string, options: { path: string; maxAge: number; secure: boolean }): string {
	return `${name}=${value}; Path=${options.path}; Max-Age=${options.maxAge}; HttpOnly; SameSite=Lax${options.secure ? '; Secure' : ''}`;
}

function oauthBindingCookieOptions(config: ApiConfig) {
	return {
		path: API_V1_ROUTES.authDiscordCallback,
		maxAge: config.auth.stateTtlSeconds,
		secure: config.nodeEnv === 'production'
	};
}

function sessionCookieOptions(config: ApiConfig) {
	return {
		path: '/api/v1',
		maxAge: config.auth.sessionIdleTtlSeconds,
		secure: config.nodeEnv === 'production'
	};
}

function singleHeader(value: string | string[] | undefined): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
	const body = JSON.stringify(payload);
	response.statusCode = statusCode;
	response.setHeader('content-type', 'application/json; charset=utf-8');
	response.setHeader('content-length', Buffer.byteLength(body));
	response.end(body);
}

function writeRedirect(response: ServerResponse, location: string): void {
	response.statusCode = 302;
	response.removeHeader('content-type');
	response.setHeader('location', location);
	response.setHeader('content-length', '0');
	response.end();
}
