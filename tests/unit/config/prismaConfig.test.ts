import { afterEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalPrismaDatabaseUrl = process.env.PRISMA_DATABASE_URL;

describe('Prisma datasource configuration', () => {
	afterEach(() => {
		restoreEnv('NODE_ENV', originalNodeEnv);
		restoreEnv('DATABASE_URL', originalDatabaseUrl);
		restoreEnv('PRISMA_DATABASE_URL', originalPrismaDatabaseUrl);
		vi.resetModules();
	});

	it('fails closed when DATABASE_URL is missing outside development', async () => {
		process.env.NODE_ENV = 'production';
		process.env.DATABASE_URL = '';
		process.env.PRISMA_DATABASE_URL = 'postgresql://integration-override';
		vi.resetModules();

		await expect(import('../../../prisma.config')).rejects.toThrow('DATABASE_URL is required outside development');
	});

	it('allows the integration schema override only during development', async () => {
		process.env.NODE_ENV = 'development';
		process.env.DATABASE_URL = 'postgresql://production-database';
		process.env.PRISMA_DATABASE_URL = 'postgresql://integration-database';
		vi.resetModules();

		const config = (await import('../../../prisma.config')).default;

		expect(config.datasource?.url).toBe('postgresql://integration-database');
	});
});

function restoreEnv(key: string, value: string | undefined) {
	if (value === undefined) {
		delete process.env[key];
		return;
	}

	process.env[key] = value;
}
