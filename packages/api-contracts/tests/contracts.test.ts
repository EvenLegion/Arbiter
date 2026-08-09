import { describe, expect, it } from 'vitest';

import { API_V1_ROUTES, ApiErrorEnvelopeSchema, HealthResponseSchema, normalizeApiScopes } from '../src/v1';

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

	it('keeps the initial scope catalog intentionally small', () => {
		expect(normalizeApiScopes(['users:read'])).toEqual(['users:read']);
	});
});
