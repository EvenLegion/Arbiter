import { z } from 'zod';
import { Cron } from '@sapphire/cron';

import { env } from './env';

const ConfigSchema = z.object({
	NODE_ENV: z.enum(['development', 'production']).default('development'),
	LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

	BETTER_STACK_SOURCE_TOKEN: z.string().optional(),
	BETTER_STACK_INGESTING_HOST: z.string().optional(),

	REDIS_HOST: z.string().default('127.0.0.1'),
	REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
	REDIS_PASSWORD: z.string().min(1).optional(),
	REDIS_DB: z.coerce.number().int().min(0).default(0),

	DIVISION_CACHE_REFRESH_CRON: z
		.string()
		.default('*/15 * * * *')
		.superRefine((value, ctx) => {
			try {
				// Validate at boot so invalid cron never reaches scheduled task registration.
				new Cron(value);
			} catch {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'DIVISION_CACHE_REFRESH_CRON must be a valid cron expression'
				});
			}
		}),

	AUX_VC_RECONCILE_DEBOUNCE_MS: z.coerce.number().int().min(0).default(400),

	EVENT_REVIEW_PAGE_SIZE: z.coerce.number().int().min(1).max(4).default(4),
	EVENT_REVIEW_FINALIZED_PAGE_SIZE: z.coerce.number().int().min(1).max(25).default(10)
});

const parsed = ConfigSchema.safeParse(env);

if (!parsed.success) {
	const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
	throw new Error(`Invalid environment configuration:\n${message}`);
}

export const ENV_CONFIG = parsed.data as z.infer<typeof ConfigSchema>;
