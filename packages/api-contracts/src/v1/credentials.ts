import { z } from 'zod';

import { ApiResponseMetaSchema } from './http';
import { ApiScopeSchema } from './scopes';

const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const ApiIntegrationNameSchema = z.string().trim().min(1).max(100);
export const ApiIntegrationPurposeSchema = z.string().trim().min(1).max(500);

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

export const ApiIntegrationRegistryItemSchema = ApiIntegrationSchema.extend({
	creator: z
		.object({
			userId: z.uuid(),
			discordUsername: z.string().min(1).max(100),
			discordNickname: z.string().min(1).max(100)
		})
		.strict(),
	credentialCount: z.number().int().nonnegative()
}).strict();
export type ApiIntegrationRegistryItem = z.infer<typeof ApiIntegrationRegistryItemSchema>;

export const CreateApiIntegrationRequestSchema = z
	.object({
		name: ApiIntegrationNameSchema,
		purpose: ApiIntegrationPurposeSchema
	})
	.strict();

export const EditApiIntegrationRequestSchema = CreateApiIntegrationRequestSchema.extend({
	expectedUpdatedAt: IsoDateTimeSchema
}).strict();

export const ArchiveApiIntegrationRequestSchema = z
	.object({
		expectedUpdatedAt: IsoDateTimeSchema
	})
	.strict();

export const ApiIntegrationResponseSchema = z
	.object({
		data: ApiIntegrationRegistryItemSchema,
		meta: ApiResponseMetaSchema
	})
	.strict();

export const ApiIntegrationListResponseSchema = z
	.object({
		data: z.object({ integrations: z.array(ApiIntegrationRegistryItemSchema) }).strict(),
		meta: ApiResponseMetaSchema
	})
	.strict();

export type CreateApiIntegrationRequest = z.infer<typeof CreateApiIntegrationRequestSchema>;
export type EditApiIntegrationRequest = z.infer<typeof EditApiIntegrationRequestSchema>;
export type ArchiveApiIntegrationRequest = z.infer<typeof ArchiveApiIntegrationRequestSchema>;
export type ApiIntegrationResponse = z.infer<typeof ApiIntegrationResponseSchema>;
export type ApiIntegrationListResponse = z.infer<typeof ApiIntegrationListResponseSchema>;

export const ApiCredentialStatusSchema = z.enum(['active', 'expired', 'revoked', 'integration_archived']);
export type ApiCredentialStatus = z.infer<typeof ApiCredentialStatusSchema>;

export const ApiCredentialLabelSchema = z.string().trim().min(1).max(100);

export const ApiCredentialActorSummarySchema = z
	.object({
		userId: z.uuid(),
		discordUsername: z.string().min(1).max(100),
		discordNickname: z.string().min(1).max(100)
	})
	.strict();

export const ApiCredentialMetadataSchema = z
	.object({
		id: z.uuid(),
		integrationId: z.uuid(),
		label: z.string().min(1).max(100),
		prefix: z.string().regex(/^[A-Za-z0-9_-]{12}$/),
		scopes: z.array(ApiScopeSchema).min(1),
		status: ApiCredentialStatusSchema,
		createdByUserId: z.uuid(),
		creator: ApiCredentialActorSummarySchema,
		expiresAt: IsoDateTimeSchema,
		revokedByUserId: z.uuid().nullable(),
		revokedAt: IsoDateTimeSchema.nullable(),
		lastUsedAt: IsoDateTimeSchema.nullable(),
		createdAt: IsoDateTimeSchema,
		updatedAt: IsoDateTimeSchema
	})
	.strict();
export type ApiCredentialMetadata = z.infer<typeof ApiCredentialMetadataSchema>;

export const MintApiCredentialRequestSchema = z
	.object({
		label: ApiCredentialLabelSchema,
		scopes: z.tuple([z.literal('users:read')]),
		expiresAt: IsoDateTimeSchema.optional()
	})
	.strict();

export const ApiCredentialResponseSchema = z
	.object({
		data: ApiCredentialMetadataSchema,
		meta: ApiResponseMetaSchema
	})
	.strict();

export const ApiCredentialListResponseSchema = z
	.object({
		data: z.object({ credentials: z.array(ApiCredentialMetadataSchema) }).strict(),
		meta: ApiResponseMetaSchema
	})
	.strict();

export const MintApiCredentialResponseSchema = z
	.object({
		data: z
			.object({
				credential: ApiCredentialMetadataSchema,
				secret: z.string().regex(/^arb_v1_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/)
			})
			.strict(),
		meta: ApiResponseMetaSchema
	})
	.strict();

export type MintApiCredentialRequest = z.infer<typeof MintApiCredentialRequestSchema>;
export type ApiCredentialResponse = z.infer<typeof ApiCredentialResponseSchema>;
export type ApiCredentialListResponse = z.infer<typeof ApiCredentialListResponseSchema>;
export type MintApiCredentialResponse = z.infer<typeof MintApiCredentialResponseSchema>;
