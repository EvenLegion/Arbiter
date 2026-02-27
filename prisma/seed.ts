import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import { seedDivisions } from './seeders/divisions';
import { seedEventTiers } from './seeders/eventTiers';
import { requiredEnv } from './seeders/utils';

async function main() {
	const pool = new Pool({
		connectionString: requiredEnv('DATABASE_URL')
	});
	const prisma = new PrismaClient({
		adapter: new PrismaPg(pool)
	});

	try {
		await seedDivisions(prisma);
		await seedEventTiers(prisma);
	} finally {
		await prisma.$disconnect();
		await pool.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
