import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { setupAdditionalIndexes } from './setup-indexes';
import { setupLogNotifyTrigger } from './setup-notify';

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL environment variable is required.\n' +
      'Please set it in your .env file or environment:\n' +
      '  DATABASE_URL=postgresql://tracer:tracer_dev_password@localhost:5432/tracer\n' +
      'Or run: pnpm db:start (after starting Docker Desktop)'
    );
  }

  pool = new Pool({
    connectionString: databaseUrl,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
  });

  dbInstance = drizzle(pool, { schema });

  return dbInstance;
}

export function getPool(): Pool {
  if (!pool) {
    getDb();
  }
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  return pool;
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    dbInstance = null;
  }
}

export async function setupTimescaleDB() {
  const pool = getPool();

  try {
    const extensionCheck = await pool.query(`
      SELECT EXISTS(
        SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
      ) as exists;
    `);

    if (!extensionCheck.rows[0]?.exists) {
      try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS timescaledb;');
        console.log('TimescaleDB extension created');
      } catch (error) {
        console.log('TimescaleDB extension not available, using regular PostgreSQL');
        return;
      }
    }

    try {
      await pool.query(`
        SELECT create_hypertable('logs', 'timestamp', 
          chunk_time_interval => INTERVAL '1 day',
          if_not_exists => TRUE
        );
      `);
      console.log('✅ Logs table converted to hypertable');
    } catch (error: any) {
      if (error.message?.includes('already a hypertable')) {
        console.log('Logs table already a hypertable');
      } else {
        throw error;
      }
    }

    try {
      await pool.query(`
        SELECT create_hypertable('metrics', 'window_start',
          chunk_time_interval => INTERVAL '1 day',
          if_not_exists => TRUE
        );
      `);
      console.log('✅ Metrics table converted to hypertable');
    } catch (error: any) {
      if (error.message?.includes('already a hypertable')) {
        console.log('Metrics table already a hypertable');
      } else {
        throw error;
      }
    }

    // Convert traces to hypertable (time-series data)
    try {
      await pool.query(`
        SELECT create_hypertable('traces', 'start_time',
          chunk_time_interval => INTERVAL '1 day',
          if_not_exists => TRUE
        );
      `);
      console.log('✅ Traces table converted to hypertable');
    } catch (error: any) {
      if (error.message?.includes('already a hypertable')) {
        console.log('Traces table already a hypertable');
      } else {
        throw error;
      }
    }

    // Convert spans to hypertable (time-series data)
    try {
      await pool.query(`
        SELECT create_hypertable('spans', 'start_time',
          chunk_time_interval => INTERVAL '1 day',
          if_not_exists => TRUE
        );
      `);
      console.log('✅ Spans table converted to hypertable');
    } catch (error: any) {
      if (error.message?.includes('already a hypertable')) {
        console.log('Spans table already a hypertable');
      } else {
        throw error;
      }
    }

    try {
      await pool.query(`
        SELECT add_compression_policy('logs', INTERVAL '7 days', if_not_exists => TRUE);
      `);
      await pool.query(`
        SELECT add_compression_policy('metrics', INTERVAL '7 days', if_not_exists => TRUE);
      `);
      await pool.query(`
        SELECT add_compression_policy('traces', INTERVAL '7 days', if_not_exists => TRUE);
      `);
      await pool.query(`
        SELECT add_compression_policy('spans', INTERVAL '7 days', if_not_exists => TRUE);
      `);
      console.log('✅ Compression policies added (data older than 7 days)');
    } catch (error) {
      console.log('⚠️  Compression policies not available (optional feature)');
    }

    try {
      await pool.query(`
        SELECT add_retention_policy('logs', INTERVAL '90 days', if_not_exists => TRUE);
      `);
      await pool.query(`
        SELECT add_retention_policy('metrics', INTERVAL '90 days', if_not_exists => TRUE);
      `);
      await pool.query(`
        SELECT add_retention_policy('traces', INTERVAL '90 days', if_not_exists => TRUE);
      `);
      await pool.query(`
        SELECT add_retention_policy('spans', INTERVAL '90 days', if_not_exists => TRUE);
      `);
      console.log('✅ Retention policies added (90 days)');
    } catch (error) {
      console.log('⚠️  Retention policies not available (optional feature)');
    }

    console.log('\n📊 TimescaleDB configuration complete:');
    console.log('   ✅ Logs: Hypertable (time-series optimized)');
    console.log('   ✅ Metrics: Hypertable (time-series optimized)');
    console.log('   ✅ Traces: Hypertable (time-series optimized)');
    console.log('   ✅ Spans: Hypertable (time-series optimized)');
    console.log('   📋 Alerts: Regular table (relational data)');
    console.log('   🔑 API Keys: Regular table (relational data)');
  } catch (error) {
    console.warn('TimescaleDB setup failed (this is optional):', error);
  }

  await setupAdditionalIndexes();
  await setupLogNotifyTrigger();
}
