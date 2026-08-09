import { z } from 'zod';

import { ApiScopeSchema } from './scopes';

const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const ApiIntegrationStateSchema = z.enum(['active', 'archived']);
export type ApiIntegrationState = z.infer<typeof ApiIntegrationStateSchema>;

export const ApiIntegrationSchema = z
	.object({
		id: z.uuid(),
		name: z.string().min(1).max(100),
		purpose: z.string().min(1).max(500),
		state: ApiIntegrationStateSchema,
		createdByUserId: z.uuid(),
		updatedByUserId: z.uuid(),
		archivedByUserId: z.uuid().nullable(),
		archivedAt: IsoDateTimeSchema.nullable(),
		createdAt: IsoDateTimeSchema,
		updatedAt: IsoDateTimeSchema
	})
	.strict();
export type ApiIntegration = z.infer<typeof ApiIntegrationSchema>;

export const ApiCredentialStatusSchema = z.enum(['active', 'expired', 'revoked', 'integration_archived']);
export type ApiCredentialStatus = z.infer<typeof ApiCredentialStatusSchema>;

export const ApiCredentialMetadataSchema = z
	.object({
		id: z.uuid(),
		integrationId: z.uuid(),
		label: z.string().min(1).max(100),
		prefix: z.string().regex(/^[A-Za-z0-9_-]{12}$/),
		scopes: z.array(ApiScopeSchema).min(1),
		status: ApiCredentialStatusSchema,
		createdByUserId: z.uuid(),
		expiresAt: IsoDateTimeSchema,
		revokedByUserId: z.uuid().nullable(),
		revokedAt: IsoDateTimeSchema.nullable(),
		lastUsedAt: IsoDateTimeSchema.nullable(),
		createdAt: IsoDateTimeSchema,
		updatedAt: IsoDateTimeSchema
	})
	.strict();
export type ApiCredentialMetadata = z.infer<typeof ApiCredentialMetadataSchema>;
