import {
	API_V1_ROUTES,
	API_CONTRACT_VERSION,
	API_CONTRACT_VERSION_HEADER,
	ApiErrorEnvelopeSchema,
	ApiCredentialListResponseSchema,
	ApiCredentialResponseSchema,
	ApiIntegrationListResponseSchema,
	ApiIntegrationResponseSchema,
	AuthIdentityResponseSchema,
	AuthLogoutResponseSchema,
	AuthSessionResponseSchema,
	OAuthStartResponseSchema,
	MintApiCredentialResponseSchema,
	apiCredentialRevokeRoute,
	apiIntegrationCredentialsRoute,
	type ApiAuthIdentity,
	type ApiCredentialMetadata,
	type MintApiCredentialRequest,
	type ApiIntegrationRegistryItem,
	type ApiErrorCode
} from '@arbiter/api-contracts';

import type { PortalConfig } from './config';

type Schema<T> = { parse: (value: unknown) => T };

export class PortalApiError extends Error {
	public constructor(
		public readonly code: ApiErrorCode | 'invalid_response' | 'network_error',
		message: string,
		public readonly status: number | null,
		public readonly requestId: string | null
	) {
		super(message);
		this.name = 'PortalApiError';
	}
}

export type PortalSession = {
	identity: ApiAuthIdentity;
	csrfToken: string;
	idleExpiresAt: string;
	absoluteExpiresAt: string;
};

export function createPortalApi(config: PortalConfig, fetchImpl: typeof fetch = fetch) {
	async function request<T>(path: string, schema: Schema<T>, init: RequestInit = {}): Promise<T> {
		let response: Response;
		try {
			response = await fetchImpl(`${config.apiBaseUrl}${path}`, {
				...init,
				credentials: 'include',
				headers: { accept: 'application/json', ...init.headers }
			});
		} catch {
			throw new PortalApiError('network_error', 'The Arbiter API could not be reached.', null, null);
		}
		if (response.headers.get(API_CONTRACT_VERSION_HEADER) !== API_CONTRACT_VERSION) {
			throw new PortalApiError(
				'invalid_response',
				'The Arbiter API is not compatible with this portal deployment.',
				response.status,
				response.headers.get('x-request-id')
			);
		}

		const payload = await readJson(response);
		if (!response.ok) {
			const parsed = ApiErrorEnvelopeSchema.safeParse(payload);
			if (parsed.success) {
				throw new PortalApiError(parsed.data.error.code, parsed.data.error.message, response.status, parsed.data.error.requestId);
			}
			throw new PortalApiError('invalid_response', 'The Arbiter API returned an unreadable error.', response.status, null);
		}

		try {
			return schema.parse(payload);
		} catch {
			throw new PortalApiError('invalid_response', 'The Arbiter API returned an unexpected response.', response.status, null);
		}
	}

	function mutationHeaders(csrfToken: string): HeadersInit {
		return { 'content-type': 'application/json', 'x-csrf-token': csrfToken };
	}

	return {
		startSignIn: async (redirectUri: string): Promise<string> => {
			const result = await request(API_V1_ROUTES.authDiscordStart, OAuthStartResponseSchema, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ redirectUri })
			});
			return result.data.authorizationUrl;
		},
		recoverSession: async (): Promise<PortalSession> => {
			const session = await request(API_V1_ROUTES.authSession, AuthSessionResponseSchema);
			const identity = await request(API_V1_ROUTES.authIdentity, AuthIdentityResponseSchema);
			return {
				identity: identity.data,
				csrfToken: session.data.csrfToken,
				idleExpiresAt: session.data.idleExpiresAt,
				absoluteExpiresAt: session.data.absoluteExpiresAt
			};
		},
		logout: async (csrfToken: string): Promise<void> => {
			await request(API_V1_ROUTES.authLogout, AuthLogoutResponseSchema, {
				method: 'POST',
				headers: mutationHeaders(csrfToken)
			});
		},
		listIntegrations: async (includeArchived: boolean): Promise<ApiIntegrationRegistryItem[]> => {
			const query = includeArchived ? '?includeArchived=true' : '';
			const result = await request(`${API_V1_ROUTES.integrationRegistry}${query}`, ApiIntegrationListResponseSchema);
			return result.data.integrations;
		},
		createIntegration: async (csrfToken: string, input: { name: string; purpose: string }): Promise<ApiIntegrationRegistryItem> => {
			const result = await request(API_V1_ROUTES.integrationRegistry, ApiIntegrationResponseSchema, {
				method: 'POST',
				headers: mutationHeaders(csrfToken),
				body: JSON.stringify(input)
			});
			return result.data;
		},
		editIntegration: async (
			csrfToken: string,
			integrationId: string,
			input: { name: string; purpose: string; expectedUpdatedAt: string }
		): Promise<ApiIntegrationRegistryItem> => {
			const result = await request(`${API_V1_ROUTES.integrationRegistry}/${encodeURIComponent(integrationId)}`, ApiIntegrationResponseSchema, {
				method: 'PATCH',
				headers: mutationHeaders(csrfToken),
				body: JSON.stringify(input)
			});
			return result.data;
		},
		archiveIntegration: async (csrfToken: string, integrationId: string, expectedUpdatedAt: string): Promise<ApiIntegrationRegistryItem> => {
			const result = await request(
				`${API_V1_ROUTES.integrationRegistry}/${encodeURIComponent(integrationId)}/archive`,
				ApiIntegrationResponseSchema,
				{
					method: 'POST',
					headers: mutationHeaders(csrfToken),
					body: JSON.stringify({ expectedUpdatedAt })
				}
			);
			return result.data;
		},
		listCredentials: async (integrationId: string): Promise<ApiCredentialMetadata[]> => {
			const result = await request(apiIntegrationCredentialsRoute(integrationId), ApiCredentialListResponseSchema);
			return result.data.credentials;
		},
		mintCredential: async (
			csrfToken: string,
			integrationId: string,
			input: MintApiCredentialRequest
		): Promise<{ credential: ApiCredentialMetadata; secret: string }> => {
			const result = await request(apiIntegrationCredentialsRoute(integrationId), MintApiCredentialResponseSchema, {
				method: 'POST',
				headers: mutationHeaders(csrfToken),
				body: JSON.stringify(input)
			});
			return result.data;
		},
		revokeCredential: async (csrfToken: string, integrationId: string, credentialId: string): Promise<ApiCredentialMetadata> => {
			const result = await request(apiCredentialRevokeRoute(integrationId, credentialId), ApiCredentialResponseSchema, {
				method: 'POST',
				headers: mutationHeaders(csrfToken)
			});
			return result.data;
		}
	};
}

async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

export type PortalApi = ReturnType<typeof createPortalApi>;
