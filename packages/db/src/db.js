"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.getPool = getPool;
exports.closeDb = closeDb;
exports.setupTimescaleDB = setupTimescaleDB;
const node_postgres_1 = require("drizzle-orm/node-postgres");
const pg_1 = require("pg");
const schema = __importStar(require("./schema"));
const setup_indexes_1 = require("./setup-indexes");
const setup_notify_1 = require("./setup-notify");
let pool = null;
let dbInstance = null;
function getDb() {
    if (dbInstance) {
        return dbInstance;
    }
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error('DATABASE_URL environment variable is required.\n' +
            'Please set it in your .env file or environment:\n' +
            '  DATABASE_URL=postgresql://tracer:tracer_dev_password@localhost:5432/tracer\n' +
            'Or run: pnpm db:start (after starting Docker Desktop)');
    }
    pool = new pg_1.Pool({
        connectionString: databaseUrl,
        max: 20, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
    });
    dbInstance = (0, node_postgres_1.drizzle)(pool, { schema });
    return dbInstance;
}
function getPool() {
    if (!pool) {
        getDb();
    }
    if (!pool) {
        throw new Error('Database pool not initialized');
    }
    return pool;
}
async function closeDb() {
    if (pool) {
        await pool.end();
        pool = null;
        dbInstance = null;
    }
}
async function setupTimescaleDB() {
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
            }
            catch (error) {
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
        }
        catch (error) {
            if (error.message?.includes('already a hypertable')) {
                console.log('Logs table already a hypertable');
            }
            else {
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
        }
        catch (error) {
            if (error.message?.includes('already a hypertable')) {
                console.log('Metrics table already a hypertable');
            }
            else {
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
        }
        catch (error) {
            if (error.message?.includes('already a hypertable')) {
                console.log('Traces table already a hypertable');
            }
            else {
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
        }
        catch (error) {
            if (error.message?.includes('already a hypertable')) {
                console.log('Spans table already a hypertable');
            }
            else {
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
        }
        catch (error) {
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
        }
        catch (error) {
            console.log('⚠️  Retention policies not available (optional feature)');
        }
        console.log('\n📊 TimescaleDB configuration complete:');
        console.log('   ✅ Logs: Hypertable (time-series optimized)');
        console.log('   ✅ Metrics: Hypertable (time-series optimized)');
        console.log('   ✅ Traces: Hypertable (time-series optimized)');
        console.log('   ✅ Spans: Hypertable (time-series optimized)');
        console.log('   📋 Alerts: Regular table (relational data)');
        console.log('   🔑 API Keys: Regular table (relational data)');
    }
    catch (error) {
        console.warn('TimescaleDB setup failed (this is optional):', error);
    }
    await (0, setup_indexes_1.setupAdditionalIndexes)();
    await (0, setup_notify_1.setupLogNotifyTrigger)();
}
//# sourceMappingURL=db.js.map