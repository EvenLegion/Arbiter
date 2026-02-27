import { z } from 'zod';

import { env } from './env';

const DbSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

const parsed = DbSchema.safeParse(env);

if (!parsed.success) {
  const message = parsed.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${message}`);
}

export const ENV_DB = parsed.data as z.infer<typeof DbSchema>;
