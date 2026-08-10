import type { IncomingMessage, ServerResponse } from 'node:http';

import {
	API_V1_ROUTES,
	ArchiveApiIntegrationRequestSchema,
	CreateApiIntegrationRequestSchema,
	EditApiIntegrationRequestSchema,
	MintApiCredentialRequestSchema
} from '@arbiter/api-contracts';
import { z } from 'zod';

import { requireBrowserSession } from '../auth/http';
import type { AuthService } from '../auth/types';
import type { ApiConfig } from '../config';
import type { ApiCredentialService, ApiCredentialServiceErrorCode, ApiCredentialServiceResult } from '../credentials/types';
import { ApiHttpError } from '../http/errors';

const IntegrationIdSchema = z.uuid();

export async function handleIntegrationHttpRequest({
	request,
	response,
	url,
	requestId,
	body,
	config,
	authService,
	credentialService,
	signal
}: {
	request: IncomingMessage;
	response: ServerResponse;
	url: URL;
	requestId: string;
	body: unknown;
	config: ApiConfig;
	authService: AuthService;
	credentialService: ApiCredentialService;
	signal: AbortSignal;
}): Promise<boolean> {
	const route = parseIntegrationRoute(url.pathname);
	if (!route) return false;

	if (route.kind === 'collection' && request.method === 'GET') {
		const includeArchived = parseIncludeArchived(url);
		const session = await requireBrowserSession({ request, response, config, authService, requireCsrf: false, signal });
		const result = await callService(
			() => credentialService.listIntegrations({ userId: session.identity.userId, role: session.identity.role }, includeArchived),
			signal
		);
		writeResult(response, requestId, result, 200, (integrations) => ({ integrations }));
		return true;
	}

	if (route.kind === 'collection') {
		requireMethod(request, response, ['GET', 'POST']);
		const session = await requireBrowserSession({ request, response, config, authService, requireCsrf: true, signal });
		const input = CreateApiIntegrationRequestSchema.safeParse(body);
		if (!input.success) throw new ApiHttpError(400, 'bad_request', 'Integration name and purpose are required');
		const result = await callService(
			() => credentialService.createIntegration({ userId: session.identity.userId, role: session.identity.role }, input.data, signal),
			signal
		);
		writeResult(response, requestId, result, 201, (integration) => integration);
		return true;
	}

	if (route.kind === 'item') {
		requireMethod(request, response, ['PATCH']);
		const session = await requireBrowserSession({ request, response, config, authService, requireCsrf: true, signal });
		const input = EditApiIntegrationRequestSchema.safeParse(body);
		if (!input.success) throw new ApiHttpError(400, 'bad_request', 'Integration update is invalid');
		const result = await callService(
			() =>
				credentialService.editIntegration(
					{ userId: session.identity.userId, role: session.identity.role },
					{ integrationId: route.integrationId, ...input.data },
					signal
				),
			signal
		);
		writeResult(response, requestId, result, 200, (integration) => integration);
		return true;
	}

	if (route.kind === 'credentials') {
		if (request.method === 'GET') {
			const session = await requireBrowserSession({ request, response, config, authService, requireCsrf: false, signal });
			const result = await callService(
				() =>
					credentialService.listCredentials({ userId: session.identity.userId, role: session.identity.role }, route.integrationId, signal),
				signal
			);
			writeResult(response, requestId, result, 200, (credentials) => ({ credentials }));
			return true;
		}

		requireMethod(request, response, ['GET', 'POST']);
		const session = await requireBrowserSession({ request, response, config, authService, requireCsrf: true, signal });
		const input = MintApiCredentialRequestSchema.safeParse(body);
		if (!input.success) throw new ApiHttpError(400, 'bad_request', 'Credential label, scope, or expiry is invalid');
		const result = await callService(
			() =>
				credentialService.mintCredential(
					{ userId: session.identity.userId, role: session.identity.role },
					{
						integrationId: route.integrationId,
						label: input.data.label,
						scopes: input.data.scopes,
						expiresAt: input.data.expiresAt ? new Date(input.data.expiresAt) : undefined
					},
					signal
				),
			signal
		);
		writeResult(response, requestId, result, 201, (minted) => minted);
		return true;
	}

	if (route.kind === 'credential-revoke') {
		requireMethod(request, response, ['POST']);
		const session = await requireBrowserSession({ request, response, config, authService, requireCsrf: true, signal });
		const result = await callService(
			() =>
				credentialService.revokeCredential(
					{ userId: session.identity.userId, role: session.identity.role },
					route.credentialId,
					route.integrationId,
					signal
				),
			signal
		);
		writeResult(response, requestId, result, 200, (credential) => credential);
		return true;
	}

	if (route.kind !== 'archive') throw new ApiHttpError(404, 'not_found', 'Route not found');
	requireMethod(request, response, ['POST']);
	const session = await requireBrowserSession({ request, response, config, authService, requireCsrf: true, signal });
	const input = ArchiveApiIntegrationRequestSchema.safeParse(body);
	if (!input.success) throw new ApiHttpError(400, 'bad_request', 'Archive request is invalid');
	const result = await callService(
		() =>
			credentialService.archiveIntegration(
				{ userId: session.identity.userId, role: session.identity.role },
				{ integrationId: route.integrationId, expectedUpdatedAt: input.data.expectedUpdatedAt },
				signal
			),
		signal
	);
	writeResult(response, requestId, result, 200, (integration) => integration);
	return true;
}

function parseIntegrationRoute(
	pathname: string
):
	| { kind: 'collection' }
	| { kind: 'item'; integrationId: string }
	| { kind: 'archive'; integrationId: string }
	| { kind: 'credentials'; integrationId: string }
	| { kind: 'credential-revoke'; integrationId: string; credentialId: string }
	| null {
	if (pathname === API_V1_ROUTES.integrationRegistry) return { kind: 'collection' };
	if (!pathname.startsWith(`${API_V1_ROUTES.integrationRegistry}/`)) return null;
	const segments = pathname.slice(API_V1_ROUTES.integrationRegistry.length + 1).split('/');
	const parsedId = IntegrationIdSchema.safeParse(segments[0]);
	if (!parsedId.success) throw new ApiHttpError(400, 'bad_request', 'Integration ID is invalid');
	if (segments.length === 1) return { kind: 'item', integrationId: parsedId.data };
	if (segments.length === 2 && segments[1] === 'archive') return { kind: 'archive', integrationId: parsedId.data };
	if (segments.length === 2 && segments[1] === 'credentials') return { kind: 'credentials', integrationId: parsedId.data };
	if (segments.length === 4 && segments[1] === 'credentials' && segments[3] === 'revoke') {
		const parsedCredentialId = IntegrationIdSchema.safeParse(segments[2]);
		if (!parsedCredentialId.success) throw new ApiHttpError(400, 'bad_request', 'Credential ID is invalid');
		return { kind: 'credential-revoke', integrationId: parsedId.data, credentialId: parsedCredentialId.data };
	}
	throw new ApiHttpError(404, 'not_found', 'Route not found');
}

function parseIncludeArchived(url: URL): boolean {
	if ([...url.searchParams.keys()].some((key) => key !== 'includeArchived')) {
		throw new ApiHttpError(400, 'bad_request', 'Unsupported registry query');
	}
	const value = url.searchParams.get('includeArchived');
	if (value === null || value === 'false') return false;
	if (value === 'true') return true;
	throw new ApiHttpError(400, 'bad_request', 'includeArchived must be true or false');
}

async function callService<T>(operation: () => Promise<ApiCredentialServiceResult<T>>, signal: AbortSignal) {
	try {
		const result = await operation();
		signal.throwIfAborted();
		return result;
	} catch {
		signal.throwIfAborted();
		throw new ApiHttpError(503, 'service_unavailable', 'Integration and credential management is unavailable');
	}
}

function writeResult<T, U>(
	response: ServerResponse,
	requestId: string,
	result: ApiCredentialServiceResult<T>,
	successStatus: number,
	mapValue: (value: T) => U
): void {
	if (!result.ok) throw toIntegrationHttpError(result.error.code);
	writeJson(response, successStatus, { data: mapValue(result.value), meta: { requestId } });
}

function toIntegrationHttpError(code: ApiCredentialServiceErrorCode): ApiHttpError {
	switch (code) {
		case 'invalid_input':
			return new ApiHttpError(400, 'bad_request', 'Management request is invalid');
		case 'forbidden':
			return new ApiHttpError(403, 'forbidden', 'You are not allowed to manage this integration or credential');
		case 'not_found':
			return new ApiHttpError(404, 'not_found', 'Integration or credential was not found');
		case 'conflict':
			return new ApiHttpError(409, 'conflict', 'An integration with this normalized name already exists');
		case 'stale':
			return new ApiHttpError(409, 'stale', 'Integration changed; refresh before trying again');
		case 'integration_archived':
			return new ApiHttpError(409, 'integration_archived', 'Archived integrations cannot be changed or mint credentials');
		case 'invalid_credential':
			return new ApiHttpError(500, 'internal_error', 'Internal server error');
	}
}

function requireMethod(request: IncomingMessage, response: ServerResponse, allowed: readonly string[]): void {
	if (request.method && allowed.includes(request.method)) return;
	response.setHeader('allow', allowed.join(', '));
	throw new ApiHttpError(405, 'method_not_allowed', 'Method not allowed');
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
	if (response.writableEnded) return;
	const responseBody = JSON.stringify(payload);
	response.statusCode = statusCode;
	response.setHeader('content-type', 'application/json; charset=utf-8');
	response.setHeader('content-length', Buffer.byteLength(responseBody));
	response.end(responseBody);
}
