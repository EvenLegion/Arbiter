import { z, type ZodType } from 'zod';

import {
	AuthIdentityResponseSchema,
	AuthLogoutResponseSchema,
	AuthSessionResponseSchema,
	CsrfTokenSchema,
	OAuthCallbackQuerySchema,
	OAuthStartRequestSchema,
	OAuthStartResponseSchema
} from './auth';
import {
	ApiCredentialListResponseSchema,
	ApiCredentialIdSchema,
	ApiCredentialResponseSchema,
	ApiIntegrationIdSchema,
	ApiIntegrationListQuerySchema,
	ApiIntegrationListResponseSchema,
	ApiIntegrationResponseSchema,
	ArchiveApiIntegrationRequestSchema,
	CreateApiIntegrationRequestSchema,
	EditApiIntegrationRequestSchema,
	MintApiCredentialRequestSchema,
	MintApiCredentialResponseSchema
} from './credentials';
import { ApiDirectoryPageResponseSchema, ApiDirectoryQuerySchema, ApiDirectoryUserResponseSchema, DiscordUserIdSchema } from './directory';
import {
	API_CONTRACT_VERSION,
	API_CONTRACT_VERSION_HEADER,
	API_V1_ROUTES,
	ApiErrorCodeSchema,
	ApiErrorEnvelopeSchema,
	HealthResponseSchema,
	ReadinessResponseSchema,
	RequestIdSchema
} from './http';

export type ApiV1HttpMethod = 'get' | 'head' | 'patch' | 'post';
export type ApiV1Security = 'anonymous' | 'apiCredential' | 'browserSession' | 'browserSessionCsrf';

type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
type ApiParameterLocation = 'cookie' | 'header' | 'path' | 'query';

export type ApiV1OperationContract = {
	operationId: string;
	method: ApiV1HttpMethod;
	path: string;
	tag: 'Authentication' | 'Directory' | 'Health' | 'Integrations';
	summary: string;
	description: string;
	security: ApiV1Security;
	requiredScopes?: readonly string[];
	parameters?: readonly {
		name: string;
		location: ApiParameterLocation;
		required: boolean;
		description: string;
		schemaComponent?: string;
	}[];
	requestSchema?: string;
	requestBodyRequired?: boolean;
	success: readonly {
		status: number;
		description: string;
		schemaComponent?: string;
		redirect?: boolean;
		setCookieDescription?: string;
	}[];
	errors?: Readonly<Record<number, readonly ApiErrorCode[]>>;
	rateLimited?: boolean;
};

const integrationPath = `${API_V1_ROUTES.integrationRegistry}/{integrationId}`;
const credentialsPath = `${integrationPath}/credentials`;

export const API_V1_OPERATION_CONTRACTS = [
	operation({
		operationId: 'getHealth',
		method: 'get',
		path: API_V1_ROUTES.health,
		tag: 'Health',
		summary: 'Check process liveness',
		description: 'Returns process liveness without checking Postgres or Redis.',
		security: 'anonymous',
		success: [{ status: 200, description: 'The API process is accepting requests.', schemaComponent: 'HealthResponse' }]
	}),
	operation({
		operationId: 'headHealth',
		method: 'head',
		path: API_V1_ROUTES.health,
		tag: 'Health',
		summary: 'Check process liveness without a body',
		description: 'Returns the same status and headers as GET without a response body.',
		security: 'anonymous',
		success: [{ status: 200, description: 'The API process is accepting requests.' }]
	}),
	operation({
		operationId: 'getReadiness',
		method: 'get',
		path: API_V1_ROUTES.readiness,
		tag: 'Health',
		summary: 'Check dependency readiness',
		description: 'Checks the API-owned Postgres pool and Redis clients under a bounded deadline.',
		security: 'anonymous',
		success: [
			{ status: 200, description: 'All required dependencies are ready.', schemaComponent: 'ReadinessResponse' },
			{ status: 503, description: 'At least one required dependency is not ready.', schemaComponent: 'ReadinessResponse' }
		]
	}),
	operation({
		operationId: 'headReadiness',
		method: 'head',
		path: API_V1_ROUTES.readiness,
		tag: 'Health',
		summary: 'Check dependency readiness without a body',
		description: 'Returns the same status and headers as GET without a response body.',
		security: 'anonymous',
		success: [
			{ status: 200, description: 'All required dependencies are ready.' },
			{ status: 503, description: 'At least one required dependency is not ready.' }
		]
	}),
	operation({
		operationId: 'startDiscordOAuth',
		method: 'post',
		path: API_V1_ROUTES.authDiscordStart,
		tag: 'Authentication',
		summary: 'Start staff sign-in',
		description: 'Creates browser-bound, single-use OAuth state and returns a Discord authorization URL.',
		security: 'anonymous',
		requestSchema: 'OAuthStartRequest',
		success: [
			{
				status: 200,
				description: 'Sign-in was started.',
				schemaComponent: 'OAuthStartResponse',
				setCookieDescription: 'Creates or refreshes the HttpOnly OAuth browser binding.'
			}
		],
		errors: { 400: ['bad_request', 'invalid_redirect'], 503: ['service_unavailable'] }
	}),
	operation({
		operationId: 'completeDiscordOAuth',
		method: 'get',
		path: API_V1_ROUTES.authDiscordCallback,
		tag: 'Authentication',
		summary: 'Complete staff sign-in',
		description:
			'Consumes the one-use state, verifies current staff identity, creates a browser session, and redirects to an approved portal URL.',
		security: 'anonymous',
		parameters: [
			parameter('code', 'query', true, 'Single-use OAuth authorization code.', 'OAuthCode'),
			parameter('state', 'query', true, 'Single-use browser-bound OAuth state.', 'OAuthState'),
			parameter('arbiter_oauth_binding', 'cookie', true, 'HttpOnly browser binding created by the start operation.', 'OpaqueBrowserToken')
		],
		success: [{ status: 302, description: 'Sign-in completed and the browser is redirected.', redirect: true }],
		errors: {
			400: ['invalid_oauth_state', 'invalid_redirect'],
			403: ['forbidden'],
			502: ['oauth_failed'],
			503: ['service_unavailable']
		}
	}),
	operation({
		operationId: 'getAuthSession',
		method: 'get',
		path: API_V1_ROUTES.authSession,
		tag: 'Authentication',
		summary: 'Read the current staff session',
		description: 'Returns current session expiry and the CSRF token required for browser-session mutations.',
		security: 'browserSession',
		success: [
			{
				status: 200,
				description: 'The current staff session is active.',
				schemaComponent: 'AuthSessionResponse',
				setCookieDescription: 'Refreshes the HttpOnly session cookie idle lifetime.'
			}
		],
		errors: { 401: ['unauthorized'], 403: ['forbidden'], 503: ['service_unavailable'] }
	}),
	operation({
		operationId: 'getAuthIdentity',
		method: 'get',
		path: API_V1_ROUTES.authIdentity,
		tag: 'Authentication',
		summary: 'Read the current staff identity',
		description: 'Returns the safe canonical identity and current STAFF or EXEC role.',
		security: 'browserSession',
		success: [
			{
				status: 200,
				description: 'The current staff identity.',
				schemaComponent: 'AuthIdentityResponse',
				setCookieDescription: 'Refreshes the HttpOnly session cookie idle lifetime.'
			}
		],
		errors: { 401: ['unauthorized'], 403: ['forbidden'], 503: ['service_unavailable'] }
	}),
	operation({
		operationId: 'logoutAuthSession',
		method: 'post',
		path: API_V1_ROUTES.authLogout,
		tag: 'Authentication',
		summary: 'End the current staff session',
		description: 'Validates CSRF, revokes the Redis session, and clears the browser cookie.',
		security: 'browserSessionCsrf',
		success: [
			{
				status: 200,
				description: 'The session was ended.',
				schemaComponent: 'AuthLogoutResponse',
				setCookieDescription: 'Clears the HttpOnly browser session cookie.'
			}
		],
		errors: { 401: ['unauthorized'], 403: ['forbidden', 'csrf_failed'], 503: ['service_unavailable'] }
	}),
	operation({
		operationId: 'listIntegrations',
		method: 'get',
		path: API_V1_ROUTES.integrationRegistry,
		tag: 'Integrations',
		summary: 'List API integrations',
		description: 'Lists the staff-visible integration registry with safe creator and credential-count metadata.',
		security: 'browserSession',
		parameters: [parameter('includeArchived', 'query', false, 'Include archived integrations. Defaults to false.', 'IncludeArchived')],
		success: [{ status: 200, description: 'The visible integration registry.', schemaComponent: 'ApiIntegrationListResponse' }],
		errors: { 400: ['bad_request'], 401: ['unauthorized'], 403: ['forbidden'], 503: ['service_unavailable'] }
	}),
	operation({
		operationId: 'createIntegration',
		method: 'post',
		path: API_V1_ROUTES.integrationRegistry,
		tag: 'Integrations',
		summary: 'Create an API integration',
		description: 'Registers an integration for the current authenticated staff member.',
		security: 'browserSessionCsrf',
		requestSchema: 'CreateApiIntegrationRequest',
		success: [{ status: 201, description: 'The integration was created.', schemaComponent: 'ApiIntegrationResponse' }],
		errors: {
			400: ['bad_request'],
			401: ['unauthorized'],
			403: ['forbidden', 'csrf_failed'],
			409: ['conflict'],
			503: ['service_unavailable']
		}
	}),
	operation({
		operationId: 'editIntegration',
		method: 'patch',
		path: integrationPath,
		tag: 'Integrations',
		summary: 'Edit an API integration',
		description: 'Edits active integration metadata as its creator or an EXEC using optimistic concurrency.',
		security: 'browserSessionCsrf',
		parameters: [integrationIdParameter()],
		requestSchema: 'EditApiIntegrationRequest',
		success: [{ status: 200, description: 'The integration was updated.', schemaComponent: 'ApiIntegrationResponse' }],
		errors: managementMutationErrors(['conflict', 'stale', 'integration_archived'])
	}),
	operation({
		operationId: 'archiveIntegration',
		method: 'post',
		path: `${integrationPath}/archive`,
		tag: 'Integrations',
		summary: 'Archive an API integration',
		description: 'Idempotently archives an integration as EXEC and invalidates its credentials.',
		security: 'browserSessionCsrf',
		parameters: [integrationIdParameter()],
		requestSchema: 'ArchiveApiIntegrationRequest',
		success: [{ status: 200, description: 'The integration is archived.', schemaComponent: 'ApiIntegrationResponse' }],
		errors: managementMutationErrors(['stale'])
	}),
	operation({
		operationId: 'listIntegrationCredentials',
		method: 'get',
		path: credentialsPath,
		tag: 'Integrations',
		summary: 'List integration credentials',
		description: 'Lists safe credential metadata without any recoverable secret.',
		security: 'browserSession',
		parameters: [integrationIdParameter()],
		success: [{ status: 200, description: 'Safe credential metadata.', schemaComponent: 'ApiCredentialListResponse' }],
		errors: { 400: ['bad_request'], 401: ['unauthorized'], 403: ['forbidden'], 404: ['not_found'], 503: ['service_unavailable'] }
	}),
	operation({
		operationId: 'mintIntegrationCredential',
		method: 'post',
		path: credentialsPath,
		tag: 'Integrations',
		summary: 'Mint an integration credential',
		description:
			'Mints users:read for an active integration. The generated secret appears only in this successful response and cannot be recovered later.',
		security: 'browserSessionCsrf',
		parameters: [integrationIdParameter()],
		requestSchema: 'MintApiCredentialRequest',
		success: [
			{
				status: 201,
				description: 'The credential was minted and its secret is returned exactly once.',
				schemaComponent: 'MintApiCredentialResponse'
			}
		],
		errors: managementMutationErrors(['integration_archived'])
	}),
	operation({
		operationId: 'revokeIntegrationCredential',
		method: 'post',
		path: `${credentialsPath}/{credentialId}/revoke`,
		tag: 'Integrations',
		summary: 'Revoke an integration credential',
		description: 'Idempotently revokes a credential as its creator or an EXEC.',
		security: 'browserSessionCsrf',
		parameters: [integrationIdParameter(), parameter('credentialId', 'path', true, 'Credential UUID.', 'ApiCredentialId')],
		success: [{ status: 200, description: 'The credential is revoked.', schemaComponent: 'ApiCredentialResponse' }],
		errors: managementMutationErrors([])
	}),
	operation({
		operationId: 'getDirectoryUser',
		method: 'get',
		path: `${API_V1_ROUTES.directoryUsers}/{discordUserId}`,
		tag: 'Directory',
		summary: 'Read one directory user',
		description: 'Returns one canonical user-directory record for a valid Discord snowflake.',
		security: 'apiCredential',
		requiredScopes: ['users:read'],
		parameters: [parameter('discordUserId', 'path', true, 'Discord user snowflake.', 'DiscordUserId')],
		success: [{ status: 200, description: 'The directory user.', schemaComponent: 'ApiDirectoryUserResponse' }],
		errors: directoryErrors(true),
		rateLimited: true
	}),
	operation({
		operationId: 'queryDirectoryUsers',
		method: 'post',
		path: API_V1_ROUTES.directoryQuery,
		tag: 'Directory',
		summary: 'Query directory users',
		description:
			'Runs a bounded batch and filter query with opaque cursor pagination. Filter categories intersect; division codes within one filter match any requested code.',
		security: 'apiCredential',
		requiredScopes: ['users:read'],
		requestSchema: 'ApiDirectoryQuery',
		requestBodyRequired: false,
		success: [{ status: 200, description: 'A bounded page of directory users.', schemaComponent: 'ApiDirectoryPageResponse' }],
		errors: directoryErrors(false),
		rateLimited: true
	})
] as const satisfies readonly ApiV1OperationContract[];

const schemaComponents = {
	ApiCredentialListResponse: ApiCredentialListResponseSchema,
	ApiCredentialId: ApiCredentialIdSchema,
	ApiCredentialResponse: ApiCredentialResponseSchema,
	ApiDirectoryPageResponse: ApiDirectoryPageResponseSchema,
	ApiDirectoryQuery: ApiDirectoryQuerySchema,
	ApiDirectoryUserResponse: ApiDirectoryUserResponseSchema,
	ApiErrorEnvelope: ApiErrorEnvelopeSchema,
	ApiIntegrationId: ApiIntegrationIdSchema,
	ApiIntegrationListResponse: ApiIntegrationListResponseSchema,
	ApiIntegrationResponse: ApiIntegrationResponseSchema,
	ArchiveApiIntegrationRequest: ArchiveApiIntegrationRequestSchema,
	AuthIdentityResponse: AuthIdentityResponseSchema,
	AuthLogoutResponse: AuthLogoutResponseSchema,
	AuthSessionResponse: AuthSessionResponseSchema,
	CreateApiIntegrationRequest: CreateApiIntegrationRequestSchema,
	CsrfToken: CsrfTokenSchema,
	DiscordUserId: DiscordUserIdSchema,
	EditApiIntegrationRequest: EditApiIntegrationRequestSchema,
	HealthResponse: HealthResponseSchema,
	IncludeArchived: ApiIntegrationListQuerySchema.shape.includeArchived,
	MintApiCredentialRequest: MintApiCredentialRequestSchema,
	MintApiCredentialResponse: MintApiCredentialResponseSchema,
	OAuthCallbackQuery: OAuthCallbackQuerySchema,
	OAuthCode: OAuthCallbackQuerySchema.shape.code,
	OAuthStartRequest: OAuthStartRequestSchema,
	OAuthStartResponse: OAuthStartResponseSchema,
	OAuthState: OAuthCallbackQuerySchema.shape.state,
	OpaqueBrowserToken: z.string().min(1),
	ReadinessResponse: ReadinessResponseSchema,
	RequestId: RequestIdSchema
} satisfies Record<string, ZodType>;

const defaultErrors: Readonly<Record<number, readonly ApiErrorCode[]>> = {
	400: ['bad_request'],
	403: ['origin_not_allowed'],
	405: ['method_not_allowed'],
	408: ['request_timeout'],
	413: ['payload_too_large'],
	500: ['internal_error']
};

export function buildApiV1OpenApiDocument(): Record<string, unknown> {
	assertOperationContracts();
	const schemas = Object.fromEntries(Object.entries(schemaComponents).map(([name, schema]) => [name, jsonSchemaFor(name, schema)]));

	return {
		openapi: '3.1.0',
		info: {
			title: 'Arbiter API',
			version: API_CONTRACT_VERSION,
			description:
				'Contract-derived reference for the supported Arbiter v1 HTTP surface. Browser-managed CORS preflight uses OPTIONS and is intentionally omitted as an application operation.'
		},
		servers: [{ url: 'https://api.example.invalid', description: 'Replace with the approved Arbiter API origin.' }],
		tags: [
			{ name: 'Health', description: 'Process liveness and dependency readiness.' },
			{ name: 'Authentication', description: 'Browser-session staff authentication.' },
			{ name: 'Integrations', description: 'Browser-session integration and credential administration.' },
			{ name: 'Directory', description: 'API-credential directory reads.' }
		],
		paths: buildPaths(),
		components: {
			schemas,
			securitySchemes: {
				browserSession: {
					type: 'apiKey',
					in: 'cookie',
					name: 'arbiter_session',
					description: 'HttpOnly staff browser session. It never authorizes API-credential directory routes.'
				},
				csrfToken: {
					type: 'apiKey',
					in: 'header',
					name: 'X-CSRF-Token',
					description: 'Required with browserSession for every browser-session mutation.'
				},
				apiCredential: {
					type: 'http',
					scheme: 'bearer',
					bearerFormat: 'Arbiter API credential',
					description: 'One-time-issued integration credential. Browser sessions do not satisfy this scheme.'
				}
			},
			headers: buildHeaderComponents()
		}
	};
}

export function serializeApiV1OpenApiDocument(document = buildApiV1OpenApiDocument()): string {
	return `${JSON.stringify(sortJson(document), null, 2)}\n`;
}

export function assertApiV1ReferenceMatches(actual: string): void {
	const expected = serializeApiV1OpenApiDocument();
	let normalized: string;
	try {
		normalized = serializeApiV1OpenApiDocument(JSON.parse(actual) as Record<string, unknown>);
	} catch {
		throw new Error('The checked-in Arbiter v1 OpenAPI artifact is not valid JSON.');
	}
	if (normalized !== expected) throw new Error('The checked-in Arbiter v1 OpenAPI artifact does not match the transport contracts.');
}

export function apiV1OperationKey(operation: Pick<ApiV1OperationContract, 'method' | 'path'>): string {
	return `${operation.method.toUpperCase()} ${operation.path}`;
}

function buildPaths(): Record<string, Record<string, unknown>> {
	const paths: Record<string, Record<string, unknown>> = {};
	for (const contract of API_V1_OPERATION_CONTRACTS) {
		(paths[contract.path] ??= {})[contract.method] = buildOperation(contract);
	}
	return paths;
}

function buildOperation(contract: ApiV1OperationContract): Record<string, unknown> {
	const responses: Record<string, unknown> = {};
	for (const success of contract.success) {
		responses[String(success.status)] = successResponse(success, contract.rateLimited === true);
	}
	for (const [status, codes] of Object.entries(mergeErrors(contract.errors))) {
		if (responses[status]) continue;
		responses[status] = errorResponse(
			Number(status),
			codes,
			contract.rateLimited === true,
			contract.method === 'head',
			contract.security === 'apiCredential'
		);
	}

	return withoutUndefined({
		operationId: contract.operationId,
		tags: [contract.tag],
		summary: contract.summary,
		description: contract.description,
		security: securityFor(contract.security),
		'x-required-scopes': contract.requiredScopes,
		parameters: buildParameters(contract),
		requestBody: contract.requestSchema
			? {
					required: contract.requestBodyRequired ?? true,
					content: { 'application/json': { schema: schemaRef(contract.requestSchema) } }
				}
			: undefined,
		responses
	});
}

function buildParameters(contract: ApiV1OperationContract): unknown[] {
	const parameters: unknown[] = [
		{
			name: 'X-Request-Id',
			in: 'header',
			required: false,
			description: 'Optional caller request ID. Invalid values are replaced with a generated ID.',
			schema: schemaRef('RequestId')
		}
	];
	for (const item of contract.parameters ?? []) {
		parameters.push({
			name: item.name,
			in: item.location,
			required: item.required,
			description: item.description,
			schema: item.schemaComponent ? schemaRef(item.schemaComponent) : { type: 'string' }
		});
	}
	return parameters;
}

function successResponse(success: ApiV1OperationContract['success'][number], rateLimited: boolean): Record<string, unknown> {
	const headers = responseHeaders(rateLimited);
	if (success.setCookieDescription) {
		headers['Set-Cookie'] = { description: success.setCookieDescription, schema: { type: 'string' } };
	}
	if (success.redirect) {
		return {
			description: success.description,
			headers: {
				...headers,
				Location: { description: 'Approved portal redirect URL.', schema: { type: 'string', format: 'uri' } },
				'Set-Cookie': { description: 'Clears the OAuth binding and establishes the HttpOnly browser session.', schema: { type: 'string' } }
			}
		};
	}
	return withoutUndefined({
		description: success.description,
		headers,
		content: success.schemaComponent ? { 'application/json': { schema: schemaRef(success.schemaComponent) } } : undefined
	});
}

function errorResponse(
	status: number,
	codes: readonly ApiErrorCode[],
	rateLimited: boolean,
	headOnly: boolean,
	apiCredentialRoute: boolean
): Record<string, unknown> {
	const headers = responseHeaders(rateLimited && rateHeadersCanFollowError(status));
	if (status === 401 && apiCredentialRoute) {
		headers['WWW-Authenticate'] = { description: 'Bearer challenge for API-credential routes.', schema: { type: 'string' } };
	}
	if (status === 405) headers.Allow = { description: 'Methods supported by the matched route.', schema: { type: 'string' } };
	if (status === 429) headers['Retry-After'] = headerRef('RetryAfter');
	return withoutUndefined({
		description: `Request failed with ${codes.join(', ')}.`,
		headers,
		content: headOnly
			? undefined
			: {
					'application/json': {
						schema: {
							allOf: [
								schemaRef('ApiErrorEnvelope'),
								{
									type: 'object',
									properties: {
										error: { type: 'object', properties: { code: { type: 'string', enum: codes } } }
									}
								}
							]
						}
					}
				}
	});
}

function responseHeaders(rateLimited: boolean): Record<string, unknown> {
	return {
		'X-Request-Id': headerRef('XRequestId'),
		[API_CONTRACT_VERSION_HEADER]: headerRef('ContractVersion'),
		'Access-Control-Allow-Origin': headerRef('AccessControlAllowOrigin'),
		'Access-Control-Allow-Credentials': headerRef('AccessControlAllowCredentials'),
		'Access-Control-Expose-Headers': headerRef('AccessControlExposeHeaders'),
		...(rateLimited
			? {
					'X-RateLimit-Limit': headerRef('RateLimitLimit'),
					'X-RateLimit-Remaining': headerRef('RateLimitRemaining'),
					'X-RateLimit-Reset-After': headerRef('RateLimitResetAfter')
				}
			: {})
	};
}

function buildHeaderComponents(): Record<string, unknown> {
	return {
		XRequestId: { description: 'Caller-provided or generated request correlation ID.', schema: schemaRef('RequestId') },
		ContractVersion: { description: 'Arbiter transport contract version.', schema: { type: 'string', const: API_CONTRACT_VERSION } },
		AccessControlAllowOrigin: { description: 'Present for an allowed browser origin.', schema: { type: 'string', format: 'uri' } },
		AccessControlAllowCredentials: { description: 'Present as true for an allowed browser origin.', schema: { type: 'string', const: 'true' } },
		AccessControlExposeHeaders: {
			description: 'Headers exposed to an allowed browser origin.',
			schema: { type: 'string', const: `X-Request-Id, ${API_CONTRACT_VERSION_HEADER}` }
		},
		RateLimitLimit: { description: 'Credential request allowance for the current fixed window.', schema: { type: 'integer', minimum: 1 } },
		RateLimitRemaining: { description: 'Credential requests remaining in the current fixed window.', schema: { type: 'integer', minimum: 0 } },
		RateLimitResetAfter: { description: 'Seconds until the current fixed window resets.', schema: { type: 'integer', minimum: 0 } },
		RetryAfter: { description: 'Seconds before the credential can retry after a 429 response.', schema: { type: 'integer', minimum: 0 } }
	};
}

function jsonSchemaFor(name: string, schema: ZodType): Record<string, unknown> {
	const result = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
	delete result.$schema;
	return result;
}

function assertOperationContracts(): void {
	const operationIds = new Set<string>();
	const operationKeys = new Set<string>();
	for (const contract of API_V1_OPERATION_CONTRACTS) {
		if (operationIds.has(contract.operationId)) throw new Error(`Duplicate OpenAPI operationId: ${contract.operationId}`);
		operationIds.add(contract.operationId);
		const key = apiV1OperationKey(contract);
		if (operationKeys.has(key)) throw new Error(`Duplicate OpenAPI route and method: ${key}`);
		operationKeys.add(key);
		if (contract.security === 'apiCredential' && !contract.requiredScopes?.length) {
			throw new Error(`API credential operation ${contract.operationId} must declare a scope.`);
		}
	}

	const coveredBaseRoutes = new Set(API_V1_OPERATION_CONTRACTS.map((contract) => contract.path.split('/{')[0]));
	for (const route of Object.values(API_V1_ROUTES)) {
		if (![...coveredBaseRoutes].some((covered) => route === covered || route.startsWith(`${covered}/`))) {
			throw new Error(`API route is missing from the OpenAPI operation contracts: ${route}`);
		}
	}
}

function operation<T extends ApiV1OperationContract>(contract: T): T {
	return contract;
}

function parameter(
	name: string,
	location: ApiParameterLocation,
	required: boolean,
	description: string,
	schemaComponent?: string
): NonNullable<ApiV1OperationContract['parameters']>[number] {
	return { name, location, required, description, schemaComponent };
}

function integrationIdParameter() {
	return parameter('integrationId', 'path', true, 'Integration UUID.', 'ApiIntegrationId');
}

function rateHeadersCanFollowError(status: number): boolean {
	return [400, 404, 408, 429, 500, 503].includes(status);
}

function managementMutationErrors(extraConflictCodes: readonly ApiErrorCode[]): Readonly<Record<number, readonly ApiErrorCode[]>> {
	const errors: Record<number, readonly ApiErrorCode[]> = {
		400: ['bad_request'],
		401: ['unauthorized'],
		403: ['forbidden', 'csrf_failed'],
		404: ['not_found'],
		503: ['service_unavailable']
	};
	if (extraConflictCodes.length) errors[409] = extraConflictCodes;
	return errors;
}

function directoryErrors(includeNotFound: boolean): Readonly<Record<number, readonly ApiErrorCode[]>> {
	const errors: Record<number, readonly ApiErrorCode[]> = {
		400: ['bad_request'],
		401: ['unauthorized'],
		403: ['forbidden'],
		429: ['rate_limited'],
		503: ['service_unavailable']
	};
	if (includeNotFound) errors[404] = ['not_found'];
	return errors;
}

function mergeErrors(errors?: Readonly<Record<number, readonly ApiErrorCode[]>>): Record<number, ApiErrorCode[]> {
	const merged: Record<number, ApiErrorCode[]> = {};
	for (const source of [defaultErrors, errors ?? {}]) {
		for (const [status, codes] of Object.entries(source)) {
			const key = Number(status);
			merged[key] = [...new Set([...(merged[key] ?? []), ...codes])];
		}
	}
	return merged;
}

function securityFor(security: ApiV1Security): Record<string, never[]>[] {
	switch (security) {
		case 'anonymous':
			return [];
		case 'browserSession':
			return [{ browserSession: [] }];
		case 'browserSessionCsrf':
			return [{ browserSession: [], csrfToken: [] }];
		case 'apiCredential':
			return [{ apiCredential: [] }];
	}
}

function schemaRef(name: string): { $ref: string } {
	return { $ref: `#/components/schemas/${name}` };
}

function headerRef(name: string): { $ref: string } {
	return { $ref: `#/components/headers/${name}` };
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
	return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function sortJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortJson);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
			.map(([key, item]) => [key, sortJson(item)])
	);
}
