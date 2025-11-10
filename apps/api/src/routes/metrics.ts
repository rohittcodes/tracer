import { Hono } from 'hono';
import { MetricRepository, ApiKeyRepository } from '@tracer/db';
import { ApiKey } from '@tracer/db';
import { logger } from '../logger';

type Variables = {
  apiKey?: ApiKey;
  service?: string | null;
};

const metrics = new Hono<{ Variables: Variables }>();

metrics.get('/', async (c) => {
  try {
    const apiKey = c.get('apiKey');
    const service = c.req.query('service') || apiKey?.service || undefined;
    const limitParam = c.req.query('limit') || '100';
    const limit = parseInt(limitParam, 10);
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return c.json({ error: 'Invalid limit parameter. Must be a number between 1 and 1000' }, 400);
    }

    const metricRepository = new MetricRepository();
    const metrics = await metricRepository.getLatestMetrics(service, limit);

    const metricsArray = await metrics;
    
    return c.json({ metrics: metricsArray });
  } catch (error) {
    const service = c.req.query('service') || c.get('apiKey')?.service || undefined;
    logger.error({ error, service }, 'Error fetching metrics');
    return c.json(
      { error: 'Failed to fetch metrics', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default metrics;
