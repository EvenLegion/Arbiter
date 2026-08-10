import { z } from 'zod';

import { ApiResponseMetaSchema } from './http';
import { ApiScopeSchema } from './scopes';

const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const ApiIntegrationIdSchema = z.uuid();
export const ApiCredentialIdSchema = z.uuid();
export const ApiIntegrationNameSchema = z.string().trim().min(1).max(100);
export const ApiIntegrationPurposeSchema = z.string().trim().min(1).max(500);

export const ApiIntegrationListQuerySchema = z
	.object({
		includeArchived: z.boolean().default(false)
	})
	.strict();

export const ApiIntegrationStateSchema = z.enum(['active', 'archived']);
export type ApiIntegrationState = z.infer<typeof ApiIntegrationStateSchema>;

export const ApiIntegrationSchema = z
	.object({
		id: ApiIntegrationIdSchema,
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
export const ApiCredentialSecretSchema = z
	.string()
	.regex(/^arb_v1_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/)
	.meta({
		description: 'Returned exactly once when a credential is minted; never returned by later reads.',
		readOnly: true,
		'x-returned-once': true
	});

export const ApiCredentialActorSummarySchema = z
	.object({
		userId: z.uuid(),
		discordUsername: z.string().min(1).max(100),
		discordNickname: z.string().min(1).max(100)
	})
	.strict();

export const ApiCredentialMetadataSchema = z
	.object({
		id: ApiCredentialIdSchema,
		integrationId: ApiIntegrationIdSchema,
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
		expiresAt: IsoDateTimeSchema.optional().meta({
			description:
				'Optional. Must be later than issuance and no more than one calendar year after issuance; omitted values default to one year after issuance.'
		})
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
				secret: ApiCredentialSecretSchema
			})
			.strict(),
		meta: ApiResponseMetaSchema
	})
	.strict();

export type MintApiCredentialRequest = z.infer<typeof MintApiCredentialRequestSchema>;
export type ApiIntegrationListQuery = z.infer<typeof ApiIntegrationListQuerySchema>;
export type ApiCredentialResponse = z.infer<typeof ApiCredentialResponseSchema>;
export type ApiCredentialListResponse = z.infer<typeof ApiCredentialListResponseSchema>;
export type MintApiCredentialResponse = z.infer<typeof MintApiCredentialResponseSchema>;
