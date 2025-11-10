import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { getDb } from '../db';
import { logs, NewLog } from '../schema';
import { LogEntry } from '@tracer/core';

export class LogRepository {
  /**
   * Insert a batch of logs efficiently
   */
  async insertBatch(logEntries: LogEntry[]): Promise<void> {
    const db = getDb();
    const newLogs: NewLog[] = logEntries.map((entry) => ({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      service: entry.service,
      metadata: entry.metadata || null,
      traceId: entry.traceId || null,
      spanId: entry.spanId || null,
    }));

    await db.insert(logs).values(newLogs);
  }

  /**
   * Query logs by time range, optionally filtered by service
   */
  async queryByTimeRange(
    start: Date,
    end: Date,
    service?: string,
    limit?: number
  ) {
    const db = getDb();
    const conditions = [gte(logs.timestamp, start), lte(logs.timestamp, end)];
    
    if (service) {
      conditions.push(eq(logs.service, service));
    }

    let query = db
      .select()
      .from(logs)
      .where(and(...conditions))
      .orderBy(desc(logs.timestamp));

    if (limit) {
      query = query.limit(limit) as any;
    }

    return query;
  }

  /**
   * Query logs by service
   */
  async queryByService(service: string, limit?: number) {
    const db = getDb();
    let query = db
      .select()
      .from(logs)
      .where(eq(logs.service, service))
      .orderBy(desc(logs.timestamp));

    if (limit) {
      query = query.limit(limit) as any;
    }

    return query;
  }

  /**
   * Get recent logs, optionally filtered by service
   */
  async getRecentLogs(service?: string, limit: number = 100) {
    const db = getDb();
    
    if (service) {
      return db
        .select()
        .from(logs)
        .where(eq(logs.service, service))
        .orderBy(desc(logs.timestamp))
        .limit(limit);
    }

    return db
      .select()
      .from(logs)
      .orderBy(desc(logs.timestamp))
      .limit(limit);
  }

  /**
   * Get a log by ID (for real-time processing via NOTIFY)
   */
  async getById(id: number): Promise<LogEntry | null> {
    const db = getDb();
    const result = await db
      .select()
      .from(logs)
      .where(eq(logs.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const log = result[0];
    return {
      timestamp: log.timestamp,
      level: log.level as any,
      message: log.message,
      service: log.service,
      metadata: (log.metadata as any) || {},
      traceId: log.traceId || undefined,
      spanId: log.spanId || undefined,
    };
  }

  /**
   * Get logs by trace ID (for trace correlation)
   */
  async getByTraceId(traceId: string, limit: number = 100) {
    const db = getDb();
    return db
      .select()
      .from(logs)
      .where(eq(logs.traceId, traceId))
      .orderBy(desc(logs.timestamp))
      .limit(limit);
  }

  /**
   * Get logs by span ID
   */
  async getBySpanId(spanId: string, limit: number = 100) {
    const db = getDb();
    return db
      .select()
      .from(logs)
      .where(eq(logs.spanId, spanId))
      .orderBy(desc(logs.timestamp))
      .limit(limit);
  }
}

