import { z } from 'zod';

export const API_V1_PREFIX = '/api/v1' as const;
export const API_CONTRACT_VERSION = '1' as const;
export const API_CONTRACT_VERSION_HEADER = 'x-arbiter-api-contract-version' as const;
export const API_V1_ROUTES = {
	health: `${API_V1_PREFIX}/health`,
	readiness: `${API_V1_PREFIX}/readiness`,
	authDiscordStart: `${API_V1_PREFIX}/auth/discord/start`,
	authDiscordCallback: `${API_V1_PREFIX}/auth/discord/callback`,
	authSession: `${API_V1_PREFIX}/auth/session`,
	authIdentity: `${API_V1_PREFIX}/auth/me`,
	authLogout: `${API_V1_PREFIX}/auth/logout`,
	integrationRegistry: `${API_V1_PREFIX}/integrations`,
	directoryUsers: `${API_V1_PREFIX}/users`,
	directoryQuery: `${API_V1_PREFIX}/users/query`
} as const;

export function apiIntegrationCredentialsRoute(integrationId: string): string {
	return `${API_V1_ROUTES.integrationRegistry}/${encodeURIComponent(integrationId)}/credentials`;
}

export function apiCredentialRevokeRoute(integrationId: string, credentialId: string): string {
	return `${apiIntegrationCredentialsRoute(integrationId)}/${encodeURIComponent(credentialId)}/revoke`;
}

export const RequestIdSchema = z
	.string()
	.min(1)
	.max(128)
	.regex(/^[A-Za-z0-9._:-]+$/);

export const ApiResponseMetaSchema = z.object({
	requestId: RequestIdSchema
});

export const HealthResponseSchema = z.object({
	data: z.object({ status: z.literal('ok') }),
	meta: ApiResponseMetaSchema
});

export const ReadinessResponseSchema = z.object({
	data: z.object({ status: z.enum(['ready', 'not_ready']) }),
	meta: ApiResponseMetaSchema
});

export const ApiErrorCodeSchema = z.enum([
	'bad_request',
	'method_not_allowed',
	'not_found',
	'payload_too_large',
	'request_timeout',
	'unauthorized',
	'forbidden',
	'invalid_oauth_state',
	'oauth_failed',
	'csrf_failed',
	'origin_not_allowed',
	'invalid_redirect',
	'conflict',
	'stale',
	'integration_archived',
	'rate_limited',
	'service_unavailable',
	'internal_error'
]);

export const ApiErrorEnvelopeSchema = z.object({
	error: z.object({
		code: ApiErrorCodeSchema,
		message: z.string().min(1),
		requestId: RequestIdSchema
	})
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;
