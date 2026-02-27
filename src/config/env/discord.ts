import { z } from 'zod';

import { env } from './env';

const DiscordSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_GUILD_ID: z.string().min(1, 'DISCORD_GUILD_ID is required'),

  VC_ACTIVITY_TICK_SECONDS: z.coerce.number().int().min(1),

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
  CMDR_ROLE_ID: z.string().min(1, 'CMDR_ROLE_ID is required'),
  TIR_ROLE_ID: z.string().min(1, 'TIR_ROLE_ID is required'),

  // Special roles
  ANG_ROLE_ID: z.string().min(1, 'ANG_ROLE_ID is required'),
  CENT_ROLE_ID: z.string().min(1, 'CENT_ROLE_ID is required'),

  // Lancearius roles
  HL_L_ROLE_ID: z.string().min(1, 'HL_L_ROLE_ID is required'),
  HV_L_ROLE_ID: z.string().min(1, 'HV_L_ROLE_ID is required'),
  VN_L_ROLE_ID: z.string().min(1, 'VN_L_ROLE_ID is required'),

  // Combat division roles
  HVK_ROLE_ID: z.string().min(1, 'HVK_ROLE_ID is required'),
  VNG_ROLE_ID: z.string().min(1, 'VNG_ROLE_ID is required'),
  HLO_ROLE_ID: z.string().min(1, 'HLO_ROLE_ID is required'),

  // Industrial division roles
  DRL_ROLE_ID: z.string().min(1, 'DRL_ROLE_ID is required'),
  SCR_ROLE_ID: z.string().min(1, 'SCR_ROLE_ID is required'),
  LOG_ROLE_ID: z.string().min(1, 'LOG_ROLE_ID is required'),
  TRD_ROLE_ID: z.string().min(1, 'TRD_ROLE_ID is required'),
  ARC_ROLE_ID: z.string().min(1, 'ARC_ROLE_ID is required'),

  // Legionnaire role
  LGN_ROLE_ID: z.string().min(1, 'LGN_ROLE_ID is required'),

  // Auxiliary role
  AUX_ROLE_ID: z.string().min(1, 'AUX_ROLE_ID is required'),

  AUX_VC_CREDIT_INTERVAL_SECONDS: z.coerce.number().int().min(1),
  AUX_VC_REQUIRED_CREDITS: z.coerce.number().int().min(1),
  AUX_VC_MIN_OTHER_QUALIFIED_MEMBERS: z.coerce.number().int().min(1),
});

const parsed = DiscordSchema.safeParse(env);

if (!parsed.success) {
  const message = parsed.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${message}`);
}

export const ENV_DISCORD = parsed.data as z.infer<typeof DiscordSchema>;
