import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { ENV_DB } from '../../config/env';

const pool = new Pool({
    connectionString: ENV_DB.DATABASE_URL,
});

export const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
});

export async function closeDb() {
    await prisma.$disconnect();
    await pool.end();
}
