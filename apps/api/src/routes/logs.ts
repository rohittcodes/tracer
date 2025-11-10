import { Hono } from 'hono';
import { logEntrySchema, batchLogEntrySchema, singleLogEntrySchema } from '../validation';
import { eventBus } from '@tracer/infra';
import { LogEntry } from '@tracer/core';
import { ApiKey, LogRepository } from '@tracer/db';
import { logger } from '../logger';

type Variables = {
  apiKey?: ApiKey;
  service?: string | null;
};

const logs = new Hono<{ Variables: Variables }>();

logs.get('/', async (c) => {
  try {
    const apiKey = c.get('apiKey');
    const service = c.req.query('service') || apiKey?.service || undefined;
    const limitParam = c.req.query('limit') || '50';
    const limit = parseInt(limitParam, 10);
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return c.json({ error: 'Invalid limit parameter. Must be a number between 1 and 1000' }, 400);
    }
    const start = c.req.query('start');
    const end = c.req.query('end');

    const logRepository = new LogRepository();

    let logs;
    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return c.json({ error: 'Invalid date format for start or end parameter' }, 400);
      }
      logs = await logRepository.queryByTimeRange(
        startDate,
        endDate,
        service,
        limit
      );
    } else {
      logs = await logRepository.getRecentLogs(service, limit);
    }

    const logsArray = await logs;
    
    return c.json({ logs: logsArray });
  } catch (error) {
    const service = c.req.query('service') || c.get('apiKey')?.service || undefined;
    logger.error({ error, service }, 'Error fetching logs');
    return c.json(
      { error: 'Failed to fetch logs', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

logs.post('/', async (c) => {
  try {
    let body: any;
    try {
      body = await c.req.json();
    } catch (error) {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }
    
    const apiKey = c.get('apiKey');
    const defaultService = apiKey?.service || null;
    
    let logEntries: LogEntry[];
    
    if (Array.isArray(body.logs)) {
      const validated = batchLogEntrySchema.parse(body);
      logEntries = validated.logs;
    } else if (body.timestamp && body.level && body.message && body.service) {
      const validated = singleLogEntrySchema.parse(body);
      logEntries = [validated];
    } else {
      return c.json({ error: 'Invalid request format. Expected { logs: [...] } or single log entry' }, 400);
    }

    if (defaultService) {
      logEntries = logEntries.map(log => ({ ...log, service: defaultService }));
    }

    let accepted = 0;
    let rejected = 0;
    const errors: string[] = [];

    // Store logs directly in database (EventBus doesn't work across processes)
    const logRepository = new LogRepository();
    
    try {
      await logRepository.insertBatch(logEntries);
      accepted = logEntries.length;
      
      // Also emit to EventBus for processor (if running in same process)
      for (const log of logEntries) {
        try {
          eventBus.emitLogReceived(log);
        } catch (error) {
          // EventBus might not have listeners, that's okay
        }
      }
    } catch (error) {
      rejected = logEntries.length;
      errors.push(`Failed to store logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return c.json(
      {
        accepted,
        rejected,
        ...(errors.length > 0 && { errors }),
      },
      202
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return c.json({ error: 'Validation failed', details: error.message }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default logs;
