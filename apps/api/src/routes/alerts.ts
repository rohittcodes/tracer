import { Hono } from 'hono';
import { AlertRepository, ApiKeyRepository } from '@tracer/db';
import { ApiKey } from '@tracer/db';
import { logger } from '../logger';

type Variables = {
  apiKey?: ApiKey;
  service?: string | null;
};

const alerts = new Hono<{ Variables: Variables }>();

alerts.get('/', async (c) => {
  try {
    const apiKey = c.get('apiKey');
    const service = c.req.query('service') || apiKey?.service || undefined;
    const active = c.req.query('active') === 'true';
    const limitParam = c.req.query('limit') || '50';
    const limit = parseInt(limitParam, 10);
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return c.json({ error: 'Invalid limit parameter. Must be a number between 1 and 1000' }, 400);
    }

    const alertRepository = new AlertRepository();

    let alerts;
    if (active) {
      alerts = await alertRepository.getActiveAlerts(service);
    } else {
      alerts = await alertRepository.getRecentAlerts(limit, service || undefined);
    }

    const alertsArray = await alerts;
    return c.json({ alerts: alertsArray });
  } catch (error) {
    const service = c.req.query('service') || c.get('apiKey')?.service || undefined;
    logger.error({ error, service }, 'Error fetching alerts');
    return c.json(
      { error: 'Failed to fetch alerts', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default alerts;


