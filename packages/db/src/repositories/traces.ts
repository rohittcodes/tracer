import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { getDb, getPool } from '../db';
import { traces, spans, NewTrace, NewSpan } from '../schema';
import { Trace, Span } from '@tracer/core';

export class TraceRepository {
  /**
   * Insert a new trace
   */
  async insertTrace(trace: Trace): Promise<number> {
    const db = getDb();
    const newTrace: NewTrace = {
      traceId: trace.traceId,
      service: trace.service,
      startTime: trace.startTime,
      endTime: trace.endTime || null,
      duration: trace.duration || null,
      spanCount: trace.spanCount,
      errorCount: trace.errorCount,
      rootSpanId: trace.rootSpanId || null,
    };

    const result = await db.insert(traces).values(newTrace).returning({ id: traces.id });
    if (!result || result.length === 0) {
      throw new Error('Failed to create trace: no result returned');
    }
    return result[0].id;
  }

  /**
   * Insert a span
   */
  async insertSpan(span: Span): Promise<number> {
    const db = getDb();
    const newSpan: NewSpan = {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId || null,
      name: span.name,
      kind: span.kind as any,
      service: span.service,
      startTime: span.startTime,
      endTime: span.endTime || null,
      duration: span.duration || null,
      status: span.status as any,
      attributes: span.attributes || null,
      events: span.events ? (span.events as any) : null,
      links: span.links ? (span.links as any) : null,
    };

    const result = await db.insert(spans).values(newSpan).returning({ id: spans.id });
    if (!result || result.length === 0) {
      throw new Error('Failed to create span: no result returned');
    }
    return result[0].id;
  }

  /**
   * Insert multiple spans in a batch
   */
  async insertSpansBatch(spanList: Span[]): Promise<void> {
    const db = getDb();
    const newSpans: NewSpan[] = spanList.map((span) => ({
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId || null,
      name: span.name,
      kind: span.kind as any,
      service: span.service,
      startTime: span.startTime,
      endTime: span.endTime || null,
      duration: span.duration || null,
      status: span.status as any,
      attributes: span.attributes || null,
      events: span.events ? (span.events as any) : null,
      links: span.links ? (span.links as any) : null,
    }));

    await db.insert(spans).values(newSpans);
  }

  /**
   * Get a trace by trace ID with all spans
   */
  async getByTraceId(traceId: string): Promise<Trace | null> {
    const db = getDb();
    
    // Get trace metadata
    const traceResult = await db
      .select()
      .from(traces)
      .where(eq(traces.traceId, traceId))
      .limit(1);

    if (traceResult.length === 0) {
      return null;
    }

    const traceData = traceResult[0];

    // Get all spans for this trace
    const spansResult = await db
      .select()
      .from(spans)
      .where(eq(spans.traceId, traceId))
      .orderBy(spans.startTime);

    const spanList: Span[] = spansResult.map((s) => ({
      traceId: s.traceId,
      spanId: s.spanId,
      parentSpanId: s.parentSpanId || undefined,
      name: s.name,
      kind: s.kind as any,
      service: s.service,
      startTime: s.startTime,
      endTime: s.endTime || undefined,
      duration: s.duration || undefined,
      status: s.status as any,
      attributes: (s.attributes as any) || undefined,
      events: (s.events as any) || undefined,
      links: (s.links as any) || undefined,
    }));

    return {
      traceId: traceData.traceId,
      service: traceData.service,
      startTime: traceData.startTime,
      endTime: traceData.endTime || undefined,
      duration: traceData.duration || undefined,
      spanCount: traceData.spanCount,
      errorCount: traceData.errorCount,
      rootSpanId: traceData.rootSpanId || undefined,
      spans: spanList,
    };
  }

  /**
   * Get recent traces, optionally filtered by service
   */
  async getRecentTraces(service?: string, limit: number = 100) {
    const db = getDb();
    
    if (service) {
      return db
        .select()
        .from(traces)
        .where(eq(traces.service, service))
        .orderBy(desc(traces.startTime))
        .limit(limit);
    }

    return db
      .select()
      .from(traces)
      .orderBy(desc(traces.startTime))
      .limit(limit);
  }

  /**
   * Query traces by time range
   */
  async queryByTimeRange(
    start: Date,
    end: Date,
    service?: string,
    limit?: number
  ) {
    const db = getDb();
    const conditions = [gte(traces.startTime, start), lte(traces.startTime, end)];
    
    if (service) {
      conditions.push(eq(traces.service, service));
    }

    let query = db
      .select()
      .from(traces)
      .where(and(...conditions))
      .orderBy(desc(traces.startTime));

    if (limit) {
      query = query.limit(limit) as any;
    }

    return query;
  }

  /**
   * Update trace end time and duration
   */
  async updateTraceEnd(traceId: string, endTime: Date, duration: number): Promise<void> {
    const db = getDb();
    await db
      .update(traces)
      .set({
        endTime,
        duration,
      })
      .where(eq(traces.traceId, traceId));
  }

  /**
   * Update span end time and duration
   */
  async updateSpanEnd(spanId: string, endTime: Date, duration: number, status?: string): Promise<void> {
    const db = getDb();
    await db
      .update(spans)
      .set({
        endTime,
        duration,
        ...(status && { status: status as any }),
      })
      .where(eq(spans.spanId, spanId));
  }

  /**
   * Get service dependencies from trace data
   * Analyzes spans to find service-to-service calls
   */
  async getServiceDependencies(timeWindowHours: number = 24): Promise<Array<{
    from: string;
    to: string;
    callCount: number;
    errorCount: number;
    avgDuration: number;
  }>> {
    const pool = getPool();
    const since = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);

    // Query to find service dependencies by analyzing parent-child span relationships
    // A dependency exists when a span from service A has a child span from service B
    const result = await pool.query(`
      SELECT 
        parent.service as from_service,
        child.service as to_service,
        COUNT(*) as call_count,
        SUM(CASE WHEN child.status = 'error' THEN 1 ELSE 0 END) as error_count,
        AVG(child.duration) as avg_duration
      FROM spans child
      INNER JOIN spans parent ON child.parent_span_id = parent.span_id
      WHERE child.start_time >= $1
        AND child.service != parent.service
      GROUP BY parent.service, child.service
      ORDER BY call_count DESC
    `, [since]);

    return result.rows.map((row: any) => {
      const callCount = parseInt(row.call_count, 10);
      const errorCount = parseInt(row.error_count, 10);
      const avgDuration = parseFloat(row.avg_duration);
      
      return {
        from: row.from_service,
        to: row.to_service,
        callCount: isNaN(callCount) ? 0 : callCount,
        errorCount: isNaN(errorCount) ? 0 : errorCount,
        avgDuration: isNaN(avgDuration) ? 0 : avgDuration,
      };
    });
  }

  /**
   * Search traces by various criteria
   */
  async searchTraces(filters: {
    service?: string;
    hasErrors?: boolean;
    minDuration?: number;
    maxDuration?: number;
    startTime?: Date;
    endTime?: Date;
    spanAttributes?: Record<string, any>; // e.g., { 'http.method': 'GET' }
    spanName?: string;
    limit?: number;
  }) {
    const db = getDb();
    const pool = getPool();
    const conditions: any[] = [];

    if (filters.service) {
      conditions.push(eq(traces.service, filters.service));
    }

    if (filters.hasErrors !== undefined) {
      if (filters.hasErrors) {
        conditions.push(sql`${traces.errorCount} > 0`);
      } else {
        conditions.push(sql`${traces.errorCount} = 0`);
      }
    }

    if (filters.minDuration !== undefined) {
      conditions.push(sql`${traces.duration} >= ${filters.minDuration}`);
    }

    if (filters.maxDuration !== undefined) {
      conditions.push(sql`${traces.duration} <= ${filters.maxDuration}`);
    }

    if (filters.startTime) {
      conditions.push(gte(traces.startTime, filters.startTime));
    }

    if (filters.endTime) {
      conditions.push(lte(traces.startTime, filters.endTime));
    }

    // If searching by span attributes or name, we need to join with spans table
    if (filters.spanAttributes || filters.spanName) {
      const spanConditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (filters.spanName) {
        spanConditions.push(`s.name = $${paramIndex}`);
        params.push(filters.spanName);
        paramIndex++;
      }

      if (filters.spanAttributes) {
        for (const [key, value] of Object.entries(filters.spanAttributes)) {
          spanConditions.push(`s.attributes->>$${paramIndex} = $${paramIndex + 1}`);
          params.push(key);
          params.push(String(value));
          paramIndex += 2;
        }
      }

      // Build trace conditions
      const traceConditions: string[] = [];
      if (filters.service) {
        traceConditions.push(`t.service = $${paramIndex}`);
        params.push(filters.service);
        paramIndex++;
      }
      if (filters.hasErrors !== undefined) {
        if (filters.hasErrors) {
          traceConditions.push(`t.error_count > 0`);
        } else {
          traceConditions.push(`t.error_count = 0`);
        }
      }
      if (filters.minDuration !== undefined) {
        traceConditions.push(`t.duration >= $${paramIndex}`);
        params.push(filters.minDuration);
        paramIndex++;
      }
      if (filters.maxDuration !== undefined) {
        traceConditions.push(`t.duration <= $${paramIndex}`);
        params.push(filters.maxDuration);
        paramIndex++;
      }
      if (filters.startTime) {
        traceConditions.push(`t.start_time >= $${paramIndex}`);
        params.push(filters.startTime);
        paramIndex++;
      }
      if (filters.endTime) {
        traceConditions.push(`t.start_time <= $${paramIndex}`);
        params.push(filters.endTime);
        paramIndex++;
      }

      const allConditions = [...traceConditions, ...spanConditions];
      const whereClause = allConditions.length > 0 
        ? `WHERE ${allConditions.join(' AND ')}`
        : '';

      const limit = filters.limit || 100;
      const query = `
        SELECT DISTINCT t.*
        FROM traces t
        INNER JOIN spans s ON t.trace_id = s.trace_id
        ${whereClause}
        ORDER BY t.start_time DESC
        LIMIT $${paramIndex}
      `;
      params.push(limit);

      const result = await pool.query(query, params);
      return result.rows;
    }

    // Standard query without span filtering
    let query = db
      .select()
      .from(traces)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(traces.startTime));

    if (filters.limit) {
      query = query.limit(filters.limit) as any;
    }

    return query;
  }
}

