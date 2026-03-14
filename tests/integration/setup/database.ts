import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { seedEventTiers } from '../../../prisma/seeders/eventTiers';
import { seedMeritTypes } from '../../../prisma/seeders/meritTypes';

const setupDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(setupDir, '..', '..', '..');

export type StandalonePrisma = {
	prisma: PrismaClient;
	close: () => Promise<void>;
};

export function createStandalonePrisma(databaseUrl: string): StandalonePrisma {
	const pool = new Pool({
		connectionString: databaseUrl
	});
	const prisma = new PrismaClient({
		adapter: new PrismaPg(pool)
	});

	return {
		prisma,
		close: async () => {
			await prisma.$disconnect();
			await pool.end();
		}
	};
}

export function pushPrismaSchema(databaseUrl: string) {
	execFileSync('pnpm', ['exec', 'prisma', 'db', 'push'], {
		cwd: repoRoot,
		env: {
			...process.env,
			DATABASE_URL: databaseUrl
		},
		stdio: 'pipe'
	});
}

export async function seedReferenceData(prisma: PrismaClient) {
	await seedMeritTypes(prisma);
	await seedEventTiers(prisma);
}

export async function resetDatabase(prisma: PrismaClient) {
	const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
		SELECT tablename
		FROM pg_tables
		WHERE schemaname = 'public'
		ORDER BY tablename ASC
	`;

	if (tables.length === 0) {
		return;
	}

	const quotedTableNames = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
	await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quotedTableNames} RESTART IDENTITY CASCADE`);
}
