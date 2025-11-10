import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { metrics, NewMetric } from '../schema';
import { Metric } from '@tracer/core';

export class MetricRepository {
  /**
   * Insert or update a metric (upsert)
   * Uses ON CONFLICT to handle duplicate metrics for the same service/type/window
   */
  async insert(metric: Metric): Promise<void> {
    const db = getDb();
    const newMetric: NewMetric = {
      service: metric.service,
      metricType: metric.metricType,
      value: metric.value,
      windowStart: metric.windowStart,
      windowEnd: metric.windowEnd,
    };

    // Use raw SQL for upsert since Drizzle doesn't have great ON CONFLICT support
    // This prevents duplicate metrics for the same service/type/window
    await db.execute(sql`
      INSERT INTO metrics (service, metric_type, value, window_start, window_end)
      VALUES (${newMetric.service}, ${newMetric.metricType}, ${newMetric.value}, ${newMetric.windowStart}, ${newMetric.windowEnd})
      ON CONFLICT DO NOTHING
    `);
  }

  /**
   * Query metrics by service and metric type within a time window
   */
  async queryByService(
    service: string,
    metricType: string,
    windowStart: Date,
    windowEnd: Date
  ) {
    const db = getDb();
    return db
      .select()
      .from(metrics)
      .where(
        and(
          eq(metrics.service, service),
          eq(metrics.metricType, metricType as any), // Cast to enum type
          gte(metrics.windowStart, windowStart),
          lte(metrics.windowEnd, windowEnd)
        )
      )
      .orderBy(desc(metrics.windowStart));
  }

  /**
   * Get latest metrics, optionally filtered by service
   */
  async getLatestMetrics(service?: string, limit: number = 100) {
    const db = getDb();
    
    if (service) {
      return db
        .select()
        .from(metrics)
        .where(eq(metrics.service, service))
        .orderBy(desc(metrics.windowStart))
        .limit(limit);
    }

    return db
      .select()
      .from(metrics)
      .orderBy(desc(metrics.windowStart))
      .limit(limit);
  }
}

