import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const localUrl = new URL('postgresql://localhost');
localUrl.username = process.env.POSTGRES_USER || 'arbiter';
localUrl.password = process.env.POSTGRES_PASSWORD || 'arbiter';
localUrl.port = process.env.POSTGRES_PORT || '5432';
localUrl.pathname = `/${process.env.POSTGRES_DB || 'arbiter'}`;

const url =
	process.env.PRISMA_DATABASE_URL ||
	(process.env.NODE_ENV === 'development' ? localUrl.toString() : process.env.DATABASE_URL || localUrl.toString());

export default defineConfig({
	datasource: {
		url
	},
	schema: 'prisma/schema'
});
