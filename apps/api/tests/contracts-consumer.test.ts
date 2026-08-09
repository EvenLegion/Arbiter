import { API_SCOPE_NAMES, ApiDirectoryPageResponseSchema, HealthResponseSchema } from '@arbiter/api-contracts';
import { resolveMeritRankLevel } from '@arbiter/domain';
import { describe, expect, it } from 'vitest';

describe('API package workspace consumers', () => {
	it('imports transport contracts and pure domain rules without bot modules', () => {
		expect(API_SCOPE_NAMES).toEqual(['users:read']);
		expect(HealthResponseSchema.safeParse({ data: { status: 'ok' }, meta: { requestId: 'consumer-1' } }).success).toBe(true);
		expect(ApiDirectoryPageResponseSchema.safeParse({ data: { users: [], nextCursor: null }, meta: { requestId: 'consumer-2' } }).success).toBe(
			true
		);
		expect(resolveMeritRankLevel(7)).toBe(3);
	});
});
