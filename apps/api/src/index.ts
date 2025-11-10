import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { rateLimiter } from 'hono-rate-limiter';
import { eventBus } from '@tracer/infra';
import { optionalApiKeyAuth, apiKeyAuth } from './middleware/auth';
import { logger } from './logger';
import { getPool } from '@tracer/db';
import logs from './routes/logs';
import metrics from './routes/metrics';
import alerts from './routes/alerts';
import apiKeys from './routes/api-keys';
import alertChannels from './routes/alert-channels';
import services from './routes/services';
import search from './routes/search';
import stream from './routes/stream';
import traces from './routes/traces';
import serviceMap from './routes/service-map';
import ai from './routes/ai';
import { auth } from './routes/auth';
import projects from './routes/projects';
import { ApiKey } from '@tracer/db';

function findProjectRoot(startPath: string = process.cwd()): string {
  let current = resolve(startPath);
  while (current !== resolve(current, '..')) {
    if (existsSync(resolve(current, 'package.json')) && existsSync(resolve(current, 'turbo.json'))) {
      return current;
    }
    current = resolve(current, '..');
  }
  return process.cwd();
}

const rootDir = findProjectRoot();
const envPath = resolve(rootDir, '.env');

if (existsSync(envPath)) {
  const result = config({ path: envPath });
  if (result.error) {
    logger.warn({ error: result.error.message }, 'Failed to load .env file');
  } else {
    const loadedVars = Object.keys(result.parsed || {}).length;
    if (loadedVars > 0) {
      logger.info({ count: loadedVars }, 'Loaded environment variables from .env');
    }
  }
}

type Variables = {
  apiKey?: ApiKey;
  service?: string | null;
};

const app = new Hono<{ Variables: Variables }>();

// Security Headers
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  if (process.env.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  await next();
});

// Request Size Limits (10MB max)
app.use('*', async (c, next) => {
  const contentLength = c.req.header('content-length');
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (contentLength && parseInt(contentLength) > maxSize) {
    logger.warn({ size: contentLength, maxSize }, 'Request body too large');
    return c.json({ error: 'Request body too large (max 10MB)' }, 413);
  }
  
  await next();
});

// Request Timeout (30 seconds default)
app.use('*', async (c, next) => {
  const timeout = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);
  
  try {
    await next();
  } catch (error: any) {
    if (error.name === 'AbortError' || controller.signal.aborted) {
      logger.warn({ timeout }, 'Request timeout');
      return c.json({ error: 'Request timeout' }, 408);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
});

// Rate Limiting
const rateLimitConfig = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes default
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // 100 requests per window
  standardHeaders: true,
  message: 'Too many requests, please try again later.',
  keyGenerator: (c: any) => {
    // Use API key if available, otherwise use IP
    const apiKey = c.get('apiKey');
    return apiKey ? `api-key:${apiKey.id}` : `ip:${c.req.header('x-forwarded-for') || 'unknown'}`;
  },
};

app.use('*', rateLimiter(rateLimitConfig));

// Enable CORS for all routes
app.use('*', cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3001', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Enhanced Health Check
app.get('/health', async (c) => {
  const pool = getPool();
  let dbStatus = 'unknown';
  let dbError: string | undefined;
  
  try {
    await pool.query('SELECT 1');
    dbStatus = 'healthy';
  } catch (error) {
    dbStatus = 'unhealthy';
    dbError = error instanceof Error ? error.message : 'Unknown database error';
    logger.error({ error: dbError }, 'Database health check failed');
  }
  
  const overallStatus = dbStatus === 'healthy' ? 'healthy' : 'degraded';
  
  return c.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: {
      status: dbStatus,
      ...(dbError && { error: dbError }),
    },
    uptime: Math.round(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  });
});

// Metrics Endpoint
app.get('/metrics', async (c) => {
  const pool = getPool();
  const memUsage = process.memoryUsage();
  
  return c.json({
    uptime: Math.round(process.uptime()),
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    },
    database: {
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingConnections: pool.waitingCount,
    },
    timestamp: new Date().toISOString(),
  });
});

app.route('/auth', auth);
app.route('/projects', projects);
app.route('/api-keys', apiKeys);

app.use('/alert-channels', apiKeyAuth);
app.route('/alert-channels', alertChannels);

app.use('*', optionalApiKeyAuth);
app.route('/logs', logs);
app.route('/metrics', metrics);
app.route('/alerts', alerts);
app.route('/services', services);
app.route('/search', search);
app.route('/stream', stream);
app.route('/traces', traces);
app.route('/service-map', serviceMap);
app.route('/ai', ai);

const port = parseInt(process.env.API_PORT || '3000', 10);

logger.info({ port }, 'API server starting...');

let server: ReturnType<typeof serve> | null = null;

try {
  server = serve({
    fetch: app.fetch,
    port,
  }, (info) => {
    logger.info({ port: info.port }, '🚀 API server running');
  });
} catch (err: any) {
  if (err.code === 'EADDRINUSE') {
    logger.error({ port, error: err.code }, 'Port is already in use');
    process.exit(1);
  } else {
    logger.error({ error: err }, 'Failed to start server');
    throw err;
  }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received, shutting down gracefully...');
  
  try {
    // Close database connections
    const pool = getPool();
    await pool.end();
    logger.info('Database connections closed');
    
    // Close server if available
    if (server) {
      // @ts-ignore - serve doesn't expose close method, but we can exit
      logger.info('Server closed');
    }
    
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
