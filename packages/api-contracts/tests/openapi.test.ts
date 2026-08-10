import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	API_V1_OPERATION_CONTRACTS,
	apiV1OperationKey,
	assertApiV1ReferenceMatches,
	buildApiV1OpenApiDocument,
	serializeApiV1OpenApiDocument
} from '../src/v1';

const artifactPath = resolve(__dirname, '../../../website/static/openapi/arbiter-v1.openapi.json');

describe('v1 OpenAPI reference', () => {
	it('publishes every supported route and method exactly once with distinct security boundaries', () => {
		const keys = API_V1_OPERATION_CONTRACTS.map(apiV1OperationKey);
		expect(keys).toHaveLength(18);
		expect(new Set(keys).size).toBe(keys.length);
		expect(keys).toContain('HEAD /api/v1/health');
		expect(keys).toContain('POST /api/v1/integrations/{integrationId}/credentials/{credentialId}/revoke');
		expect(keys).toContain('GET /api/v1/users/{discordUserId}');

		const document = buildApiV1OpenApiDocument() as {
			paths: Record<string, Record<string, { security: Record<string, string[]>[]; 'x-required-scopes'?: string[] }>>;
		};
		expect(document.paths['/api/v1/integrations'].post.security).toEqual([{ browserSession: [], csrfToken: [] }]);
		expect(document.paths['/api/v1/users/{discordUserId}'].get.security).toEqual([{ apiCredential: [] }]);
		expect(document.paths['/api/v1/users/{discordUserId}'].get['x-required-scopes']).toEqual(['users:read']);
	});

	it('derives strict fields, bounds, nullability, errors, headers, and one-time-secret semantics from contracts', () => {
		const document = buildApiV1OpenApiDocument() as {
			components: {
				headers: Record<string, Record<string, unknown>>;
				schemas: Record<string, Record<string, unknown>>;
			};
			paths: Record<
				string,
				Record<
					string,
					{
						parameters: { name: string; schema: { $ref?: string } }[];
						requestBody?: { required: boolean };
						responses: Record<string, { headers: Record<string, unknown> }>;
					}
				>
			>;
		};
		const query = document.components.schemas.ApiDirectoryQuery as {
			additionalProperties: boolean;
			properties: Record<string, Record<string, unknown>>;
		};
		expect(query.additionalProperties).toBe(false);
		expect(query.properties.limit).toMatchObject({ default: 100, minimum: 1, maximum: 100, type: 'integer' });
		expect(query.properties.discordUserIds).toMatchObject({ minItems: 1, maxItems: 100 });

		const page = document.components.schemas.ApiDirectoryPageResponse as {
			properties: { data: { properties: { nextCursor: { anyOf: unknown[] } } } };
		};
		expect(page.properties.data.properties.nextCursor.anyOf).toContainEqual({ type: 'null' });

		const mint = document.components.schemas.MintApiCredentialResponse as {
			properties: { data: { properties: { secret: Record<string, unknown> } } };
		};
		expect(mint.properties.data.properties.secret).toMatchObject({ readOnly: true, 'x-returned-once': true });
		const directory = document.paths['/api/v1/users/{discordUserId}'].get;
		for (const status of ['400', '404', '429', '503']) {
			expect(directory.responses[status].headers['X-RateLimit-Limit']).toEqual({
				$ref: '#/components/headers/RateLimitLimit'
			});
		}
		expect(document.components.headers.RateLimitLimit).toEqual({
			description: 'Credential request allowance for the current fixed window.',
			schema: { type: 'integer', minimum: 1 }
		});
		expect(directory.responses['401'].headers['WWW-Authenticate']).toEqual({
			description: 'Bearer challenge for API-credential routes.',
			schema: { type: 'string' }
		});
		expect(document.paths['/api/v1/auth/session'].get.responses['401'].headers).not.toHaveProperty('WWW-Authenticate');
		expect(document.paths['/api/v1/users/query'].post.requestBody).toMatchObject({ required: false });
		expect(
			document.paths['/api/v1/integrations/{integrationId}/credentials/{credentialId}/revoke'].post.parameters.find(
				(parameter) => parameter.name === 'credentialId'
			)?.schema.$ref
		).toBe('#/components/schemas/ApiCredentialId');
		const mintRequest = document.components.schemas.MintApiCredentialRequest as {
			properties: { expiresAt: { description: string } };
		};
		const expirationDescription = mintRequest.properties.expiresAt.description;
		expect(expirationDescription).toContain('later than issuance');
		expect(expirationDescription).toContain('no more than one calendar year');
		expect(expirationDescription).toContain('omitted values default to one year');
	});

	it('accepts the current artifact and deliberately rejects a controlled mismatch', () => {
		const artifact = readFileSync(artifactPath, 'utf8');
		expect(() => assertApiV1ReferenceMatches(artifact)).not.toThrow();
		const mismatch = serializeApiV1OpenApiDocument().replace('"openapi": "3.1.0"', '"openapi": "3.0.0"');
		expect(() => assertApiV1ReferenceMatches(mismatch)).toThrow(/does not match the transport contracts/);
	});
});
