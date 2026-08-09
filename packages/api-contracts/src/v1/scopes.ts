import { z } from 'zod';

export const API_SCOPE_NAMES = ['users:read'] as const;
export const ApiScopeSchema = z.enum(API_SCOPE_NAMES);
export type ApiScope = z.infer<typeof ApiScopeSchema>;

export function normalizeApiScopes(scopes: readonly ApiScope[]): ApiScope[] {
	const normalized = new Set(scopes);
	return API_SCOPE_NAMES.filter((scope) => normalized.has(scope));
}
