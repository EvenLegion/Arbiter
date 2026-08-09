import { z } from 'zod';

export const API_DIRECTORY_MAX_BATCH_SIZE = 100;

export const DiscordUserIdSchema = z.string().regex(/^\d{17,20}$/);
export const DivisionCodeSchema = z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,31}$/);

const RankLevelSchema = z.number().int().positive();

export const ApiDirectoryQuerySchema = z
	.object({
		discordUserIds: z.array(DiscordUserIdSchema).min(1).max(API_DIRECTORY_MAX_BATCH_SIZE).optional(),
		divisionCodesAny: z.array(DivisionCodeSchema).min(1).max(API_DIRECTORY_MAX_BATCH_SIZE).optional(),
		exactRank: RankLevelSchema.optional(),
		minimumRank: RankLevelSchema.optional(),
		maximumRank: RankLevelSchema.optional(),
		limit: z.number().int().min(1).max(API_DIRECTORY_MAX_BATCH_SIZE).default(API_DIRECTORY_MAX_BATCH_SIZE),
		cursor: z
			.string()
			.regex(/^[A-Za-z0-9_-]+$/)
			.max(512)
			.optional()
	})
	.strict()
	.superRefine((query, context) => {
		if (query.minimumRank !== undefined && query.maximumRank !== undefined && query.minimumRank > query.maximumRank) {
			context.addIssue({
				code: 'custom',
				message: 'minimumRank must be less than or equal to maximumRank',
				path: ['minimumRank']
			});
		}
	});

export const ApiDirectoryMembershipSchema = z
	.object({
		divisionCode: DivisionCodeSchema,
		divisionName: z.string().min(1),
		divisionKind: z.enum(['STAFF', 'SPECIAL', 'LANCEARIUS', 'NAVY', 'MARINES', 'SUPPORT', 'RESERVE', 'LEGIONNAIRE', 'INITIATE'])
	})
	.strict();

export const ApiDirectoryUserSchema = z
	.object({
		discordUserId: DiscordUserIdSchema,
		memberships: z.array(ApiDirectoryMembershipSchema),
		totalMerits: z.number().int(),
		rankLevel: RankLevelSchema.nullable(),
		rankSymbol: z.string().min(1).nullable()
	})
	.strict();

export const ApiDirectoryPageSchema = z
	.object({
		users: z.array(ApiDirectoryUserSchema).max(API_DIRECTORY_MAX_BATCH_SIZE),
		nextCursor: z
			.string()
			.regex(/^[A-Za-z0-9_-]+$/)
			.max(512)
			.nullable()
	})
	.strict();

export type ApiDirectoryQueryInput = z.input<typeof ApiDirectoryQuerySchema>;
export type ParsedApiDirectoryQuery = z.output<typeof ApiDirectoryQuerySchema>;
export type ApiDirectoryMembership = z.infer<typeof ApiDirectoryMembershipSchema>;
export type ApiDirectoryUser = z.infer<typeof ApiDirectoryUserSchema>;
export type ApiDirectoryPage = z.infer<typeof ApiDirectoryPageSchema>;
