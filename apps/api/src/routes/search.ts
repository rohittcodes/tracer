import { Hono } from 'hono';
import { LogRepository, getDb, logs } from '@tracer/db';
import { ApiKey } from '@tracer/db';
import { like, or, and, gte, lte, eq, desc } from 'drizzle-orm';
import { logger } from '../logger';

type Variables = {
  apiKey?: ApiKey;
  service?: string | null;
};

const search = new Hono<{ Variables: Variables }>();

// Advanced log search
search.get('/logs', async (c) => {
  try {
    const apiKey = c.get('apiKey');
    const service = c.req.query('service') || apiKey?.service || undefined;
    const query = c.req.query('q'); // Search query
    const level = c.req.query('level'); // Log level filter
    const start = c.req.query('start');
    const end = c.req.query('end');
    const limitParam = c.req.query('limit') || '100';
    const limit = parseInt(limitParam, 10);
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return c.json({ error: 'Invalid limit parameter. Must be a number between 1 and 1000' }, 400);
    }
    
    const logRepo = new LogRepository();
    const db = getDb();
    
    const conditions: any[] = [];
    
    if (service) {
      conditions.push(eq(logs.service, service));
    }
    
    if (level) {
      // Cast level to the enum type
      conditions.push(eq(logs.level, level as 'debug' | 'info' | 'warn' | 'error' | 'fatal'));
    }
    
    if (start) {
      const startDate = new Date(start);
      if (isNaN(startDate.getTime())) {
        return c.json({ error: 'Invalid date format for start parameter' }, 400);
      }
      conditions.push(gte(logs.timestamp, startDate));
    }
    
    if (end) {
      const endDate = new Date(end);
      if (isNaN(endDate.getTime())) {
        return c.json({ error: 'Invalid date format for end parameter' }, 400);
      }
      conditions.push(lte(logs.timestamp, endDate));
    }
    
    if (query) {
      conditions.push(
        or(
          like(logs.message, `%${query}%`),
          like(logs.service, `%${query}%`)
        )!
      );
    }
    
    let dbQuery = db
      .select()
      .from(logs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(logs.timestamp))
      .limit(limit);
    
    const results = await dbQuery;
    
    return c.json({
      logs: results,
      count: results.length,
      filters: {
        service,
        level,
        query,
        start,
        end,
      },
    });
  } catch (error) {
    const query = c.req.query('q');
    logger.error({ error, query }, 'Error searching logs');
    return c.json(
      { error: 'Failed to search logs', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default search;

