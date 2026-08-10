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
			components: { schemas: Record<string, Record<string, unknown>> };
			paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
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
		expect(document.paths['/api/v1/users/{discordUserId}'].get.responses).toHaveProperty('429');
		expect(document.paths['/api/v1/users/{discordUserId}'].get.responses).toHaveProperty('503');
	});

	it('accepts the current artifact and deliberately rejects a controlled mismatch', () => {
		const artifact = readFileSync(artifactPath, 'utf8');
		expect(() => assertApiV1ReferenceMatches(artifact)).not.toThrow();
		const mismatch = serializeApiV1OpenApiDocument().replace('"openapi": "3.1.0"', '"openapi": "3.0.0"');
		expect(() => assertApiV1ReferenceMatches(mismatch)).toThrow(/does not match the transport contracts/);
	});
});
