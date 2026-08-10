import { z } from 'zod';

import { ApiResponseMetaSchema } from './http';

export const ApiAuthRoleSchema = z.enum(['STAFF', 'EXEC']);
export const CsrfTokenSchema = z.string().min(32);

export const ApiAuthIdentitySchema = z
	.object({
		userId: z.uuid(),
		discordUserId: z.string().regex(/^\d{17,20}$/),
		discordUsername: z.string().min(1).max(100),
		discordNickname: z.string().min(1).max(100),
		discordAvatarUrl: z.url(),
		role: ApiAuthRoleSchema
	})
	.strict();

export const OAuthStartRequestSchema = z
	.object({
		redirectUri: z.url()
	})
	.strict();

export const OAuthCallbackQuerySchema = z
	.object({
		code: z.string().min(1),
		state: z.string().min(1)
	})
	.strict();

export const OAuthStartResponseSchema = z.object({
	data: z.object({ authorizationUrl: z.url() }),
	meta: ApiResponseMetaSchema
});

export const AuthSessionResponseSchema = z.object({
	data: z.object({
		authenticated: z.literal(true),
		csrfToken: CsrfTokenSchema,
		idleExpiresAt: z.iso.datetime(),
		absoluteExpiresAt: z.iso.datetime()
	}),
	meta: ApiResponseMetaSchema
});

export const AuthIdentityResponseSchema = z.object({
	data: ApiAuthIdentitySchema,
	meta: ApiResponseMetaSchema
});

export const AuthLogoutResponseSchema = z.object({
	data: z.object({ loggedOut: z.literal(true) }),
	meta: ApiResponseMetaSchema
});

export type ApiAuthRole = z.infer<typeof ApiAuthRoleSchema>;
export type ApiAuthIdentity = z.infer<typeof ApiAuthIdentitySchema>;
export type OAuthStartRequest = z.infer<typeof OAuthStartRequestSchema>;
export type OAuthCallbackQuery = z.infer<typeof OAuthCallbackQuerySchema>;
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
