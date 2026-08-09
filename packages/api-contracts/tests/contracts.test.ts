import { describe, expect, it } from 'vitest';

import {
	API_V1_ROUTES,
	ApiAuthIdentitySchema,
	ApiCredentialMetadataSchema,
	ApiErrorEnvelopeSchema,
	ApiIntegrationSchema,
	HealthResponseSchema,
	normalizeApiScopes
} from '../src/v1';

describe('v1 API contracts', () => {
	it('provides transport-only health and error DTOs', () => {
		expect(HealthResponseSchema.parse({ data: { status: 'ok' }, meta: { requestId: 'request-1' } })).toEqual({
			data: { status: 'ok' },
			meta: { requestId: 'request-1' }
		});
		expect(
			ApiErrorEnvelopeSchema.safeParse({
				error: { code: 'internal_error', message: 'Internal server error', requestId: 'request-1' }
			}).success
		).toBe(true);
		expect(API_V1_ROUTES.health).toBe('/api/v1/health');
	});

	it('defines safe browser auth contracts without OAuth or session secrets', () => {
		const identity = ApiAuthIdentitySchema.parse({
			userId: '33b20a61-1e86-4115-b999-f319808d5a87',
			discordUserId: '100000000000000001',
			discordUsername: 'staff-user',
			discordNickname: 'Staff User',
			discordAvatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
			role: 'STAFF'
		});
		expect(identity.role).toBe('STAFF');
		expect(identity).not.toHaveProperty('accessToken');
		expect(identity).not.toHaveProperty('sessionId');
		expect(API_V1_ROUTES.authDiscordStart).toBe('/api/v1/auth/discord/start');
		expect(API_V1_ROUTES.authIdentity).toBe('/api/v1/auth/me');
	});

	it('keeps the initial scope catalog intentionally small', () => {
		expect(normalizeApiScopes(['users:read'])).toEqual(['users:read']);
	});

	it('defines safe integration and credential metadata without secret material', () => {
		const integration = ApiIntegrationSchema.parse({
			id: 'd3234d29-3990-412c-a8d3-10db55d9e49f',
			name: 'Directory client',
			purpose: 'Read users',
			state: 'active',
			createdByUserId: '33b20a61-1e86-4115-b999-f319808d5a87',
			updatedByUserId: '33b20a61-1e86-4115-b999-f319808d5a87',
			archivedByUserId: null,
			archivedAt: null,
			createdAt: '2026-08-09T08:00:00.000Z',
			updatedAt: '2026-08-09T08:00:00.000Z'
		});
		expect(integration.state).toBe('active');

		const credential = ApiCredentialMetadataSchema.parse({
			id: '37513880-ac97-4333-b21f-eb919fa07957',
			integrationId: integration.id,
			label: 'Reader',
			prefix: 'AbCdEfGhIjKl',
			scopes: ['users:read'],
			status: 'active',
			createdByUserId: integration.createdByUserId,
			expiresAt: '2027-08-09T08:00:00.000Z',
			revokedByUserId: null,
			revokedAt: null,
			lastUsedAt: null,
			createdAt: '2026-08-09T08:00:00.000Z',
			updatedAt: '2026-08-09T08:00:00.000Z'
		});
		expect(credential).not.toHaveProperty('secret');
		expect(credential).not.toHaveProperty('verifier');
		expect(ApiCredentialMetadataSchema.safeParse({ ...credential, verifier: 'digest' }).success).toBe(false);
	});
});
