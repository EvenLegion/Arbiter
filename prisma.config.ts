import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const url =
  process.env.DATABASE_URL ||
  'postgresql://arbiter:arbiter@localhost:5432/arbiter';

export default defineConfig({
  datasource: {
    url,
  },
  schema: 'prisma/schema',
});
