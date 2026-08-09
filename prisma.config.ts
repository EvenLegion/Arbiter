import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const localUrl = new URL('postgresql://localhost');
localUrl.username = process.env.POSTGRES_USER || 'arbiter';
localUrl.password = process.env.POSTGRES_PASSWORD || 'arbiter';
localUrl.port = process.env.POSTGRES_PORT || '5432';
localUrl.pathname = `/${process.env.POSTGRES_DB || 'arbiter'}`;

const url = process.env.NODE_ENV === 'development' ? process.env.PRISMA_DATABASE_URL || localUrl.toString() : process.env.DATABASE_URL || undefined;

export default defineConfig({
	datasource: {
		url
	},
	schema: 'prisma/schema'
});
