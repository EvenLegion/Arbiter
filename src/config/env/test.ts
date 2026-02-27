import { z } from 'zod';

import { env } from './env';

const TestEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test']),

  POSTGRES_DOCKER_VERSION: z
    .string()
    .min(1, 'POSTGRES_DOCKER_VERSION is required'),

  TEST_CONTAINER_ENV_PATH: z
    .string()
    .min(1, 'TEST_CONTAINER_ENV_PATH is required'),

  TEST_DATABASE_NAME: z.string().min(1, 'TEST_DATABASE_NAME is required'),
  TEST_DATABASE_USERNAME: z
    .string()
    .min(1, 'TEST_DATABASE_USERNAME is required'),
  TEST_DATABASE_PASSWORD: z
    .string()
    .min(1, 'TEST_DATABASE_PASSWORD is required'),
});

const parsed = TestEnvSchema.safeParse(env);

if (!parsed.success) {
  const message = parsed.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${message}`);
}

export const ENV_TEST = parsed.data as z.infer<typeof TestEnvSchema>;
