import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../.env') });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL environment variable is required.\n' +
    'Please set it in your .env file or environment:\n' +
    '  DATABASE_URL=postgresql://tracer:tracer_dev_password@localhost:5432/tracer\n' +
    'Or run: pnpm db:start (after starting Docker Desktop)'
  );
}

export default {
  schema: './src/schema.ts',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config;

