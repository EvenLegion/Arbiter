import { z } from 'zod';

import { env } from './env';

const DiscordSchema = z.object({
	DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
	DISCORD_GUILD_ID: z.string().min(1, 'DISCORD_GUILD_ID is required'),

	WELCOME_CHANNEL_ID: z.string().min(1, 'WELCOME_CHANNEL_ID is required'),
	WELCOME_RULES_CHANNEL_ID: z.string().min(1, 'WELCOME_RULES_CHANNEL_ID is required'),
	WELCOME_RECRUITMENT_CHANNEL_ID: z.string().min(1, 'WELCOME_RECRUITMENT_CHANNEL_ID is required'),
	WELCOME_ROLE_SELECT_CHANNEL_ID: z.string().min(1, 'WELCOME_ROLE_SELECT_CHANNEL_ID is required'),
	WELCOME_CHARTER_CHANNEL_ID: z.string().min(1, 'WELCOME_CHARTER_CHANNEL_ID is required'),
	WELCOME_NEW_PLAYERS_CHANNEL_ID: z.string().min(1, 'WELCOME_NEW_PLAYERS_CHANNEL_ID is required'),

	BOT_REQUESTS_CHANNEL_ID: z.string().min(1, 'BOT_REQUESTS_CHANNEL_ID is required'),

	// Staff roles
	EXEC_ROLE_ID: z.string().min(1, 'EXEC_ROLE_ID is required'),
	SEC_ROLE_ID: z.string().min(1, 'SEC_ROLE_ID is required'),
	TECH_ROLE_ID: z.string().min(1, 'TECH_ROLE_ID is required'),
	CMD_ROLE_ID: z.string().min(1, 'CMD_ROLE_ID is required'),
	TIR_ROLE_ID: z.string().min(1, 'TIR_ROLE_ID is required'),

	// Special roles
	ANG_ROLE_ID: z.string().min(1, 'ANG_ROLE_ID is required'),
	CENT_ROLE_ID: z.string().min(1, 'CENT_ROLE_ID is required'),

	// Lancearius roles
	NVY_L_ROLE_ID: z.string().min(1, 'NVY_L_ROLE_ID is required'),
	MRN_L_ROLE_ID: z.string().min(1, 'MRN_L_ROLE_ID is required'),
	SUP_L_ROLE_ID: z.string().min(1, 'SUP_L_ROLE_ID is required'),

	// Division roles
	NVY_ROLE_ID: z.string().min(1, 'NVY_ROLE_ID is required'),
	MRN_ROLE_ID: z.string().min(1, 'MRN_ROLE_ID is required'),
	SUP_ROLE_ID: z.string().min(1, 'SUP_ROLE_ID is required'),

	// Legionnaire role
	LGN_ROLE_ID: z.string().min(1, 'LGN_ROLE_ID is required'),

	// Initiate and reserve roles
	INT_ROLE_ID: z.string().min(1, 'INT_ROLE_ID is required'),
	RES_ROLE_ID: z.string().min(1, 'RES_ROLE_ID is required'),

	// Event and merit tracking config
	EVENT_TRACKING_CHANNEL_ID: z.string().min(1, 'EVENT_TRACKING_CHANNEL_ID is required'),
	EVENT_TRACKING_INTERVAL_SECONDS: z.coerce.number().int().min(1),
	EVENT_MERIT_DEFAULT_MIN_ATTENDANCE_PCT: z.coerce.number().int().min(0).max(100)
});

const parsed = DiscordSchema.safeParse(env);

if (!parsed.success) {
	const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
	throw new Error(`Invalid environment configuration:\n${message}`);
}

export const ENV_DISCORD = parsed.data as z.infer<typeof DiscordSchema>;
