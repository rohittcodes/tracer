import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { alerts, NewAlert } from '../schema';
import { Alert } from '@tracer/core';
import { 
  ALERT_DEDUP_WINDOW_SECONDS, 
  ALERT_DEDUP_CLOCK_SKEW_SECONDS, 
  ALERT_DEDUP_MAX_RETRIES, 
  ALERT_DEDUP_RETRY_BASE_MS 
} from '@tracer/core';

export class AlertRepository {
  /**
   * Insert a new alert
   */
  async insert(alert: Alert): Promise<number> {
    const db = getDb();
    const newAlert: NewAlert = {
      projectId: alert.projectId || null,
      alertType: alert.alertType,
      severity: alert.severity,
      message: alert.message,
      service: alert.service,
      resolved: alert.resolved,
      createdAt: alert.createdAt,
      resolvedAt: alert.resolvedAt || null,
    };

    const result = await db.insert(alerts).values(newAlert).returning({ id: alerts.id });
    if (!result || result.length === 0) {
      throw new Error('Failed to create alert: no result returned');
    }
    return result[0].id;
  }

  /**
   * Update alert resolved status
   */
  async updateResolved(id: number, resolved: boolean): Promise<void> {
    const db = getDb();
    await db
      .update(alerts)
      .set({
        resolved,
        resolvedAt: resolved ? new Date() : null,
      })
      .where(eq(alerts.id, id));
  }

  /**
   * Update alert with new data (for severity/message updates)
   */
  async update(id: number, data: Partial<Pick<Alert, 'severity' | 'message' | 'resolved' | 'resolvedAt'>>): Promise<void> {
    const db = getDb();
    const updateData: any = {};
    if (data.severity !== undefined) updateData.severity = data.severity;
    if (data.message !== undefined) updateData.message = data.message;
    if (data.resolved !== undefined) {
      updateData.resolved = data.resolved;
      updateData.resolvedAt = data.resolved ? (data.resolvedAt || new Date()) : null;
    } else if (data.resolvedAt !== undefined) {
      updateData.resolvedAt = data.resolvedAt || null;
    }
    await db
      .update(alerts)
      .set(updateData)
      .where(eq(alerts.id, id));
  }

  /**
   * Mark alert as sent
   */
  async markAsSent(id: number, sessionId?: string): Promise<void> {
    const db = getDb();
    await db
      .update(alerts)
      .set({
        alertSent: true,
        toolRouterSessionId: sessionId || null,
        lastSentAt: new Date(),
      })
      .where(eq(alerts.id, id));
  }

  /**
   * Get the last sent alert time for a service and alert type (for rate limiting)
   */
  async getLastSentTime(service: string, alertType: string, projectId?: number): Promise<Date | null> {
    const db = getDb();
    const conditions = [
      eq(alerts.service, service),
      eq(alerts.alertType, alertType as any),
      eq(alerts.alertSent, true),
    ];
    
    if (projectId) {
      conditions.push(eq(alerts.projectId, projectId));
    }

    const result = await db
      .select({ lastSentAt: alerts.lastSentAt })
      .from(alerts)
      .where(and(...conditions))
      .orderBy(desc(alerts.lastSentAt))
      .limit(1);
    
    return result.length > 0 && result[0].lastSentAt ? new Date(result[0].lastSentAt) : null;
  }

  /**
   * Get recent unsent alerts for batching (group similar alerts together)
   */
  async getRecentUnsentAlerts(service: string, alertType: string, projectId?: number, windowMinutes: number = 5): Promise<any[]> {
    const db = getDb();
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    
    const conditions = [
      eq(alerts.service, service),
      eq(alerts.alertType, alertType as any),
      eq(alerts.alertSent, false),
      eq(alerts.resolved, false),
      gte(alerts.createdAt, windowStart),
    ];
    
    if (projectId) {
      conditions.push(eq(alerts.projectId, projectId));
    }

    return await db
      .select()
      .from(alerts)
      .where(and(...conditions))
      .orderBy(desc(alerts.createdAt));
  }

  /**
   * Get active (unresolved) alerts, optionally filtered by service
   */
  async getActiveAlerts(service?: string) {
    const db = getDb();
    const conditions = [eq(alerts.resolved, false)];
    
    if (service) {
      conditions.push(eq(alerts.service, service));
    }

    return db
      .select()
      .from(alerts)
      .where(and(...conditions))
      .orderBy(desc(alerts.createdAt));
  }

  /**
   * Get recent alerts, optionally filtered by service
   */
  async getRecentAlerts(limit: number = 100, service?: string) {
    const db = getDb();
    const conditions = [];
    
    if (service) {
      conditions.push(eq(alerts.service, service));
    }

    return db
      .select()
      .from(alerts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(alerts.createdAt))
      .limit(limit);
  }

  /**
   * Calculate time bucket for deduplication
   * Accounts for clock skew by using overlapping buckets
   */
  private calculateTimeBucket(timestamp: Date, skewMargin: number = 0): number {
    const timeMs = timestamp.getTime();
    const bucketSizeMs = ALERT_DEDUP_WINDOW_SECONDS * 1000;
    const skewMs = (ALERT_DEDUP_CLOCK_SKEW_SECONDS + skewMargin) * 1000;
    
    // Use floor division to create discrete buckets
    return Math.floor((timeMs + skewMs) / bucketSizeMs);
  }

  /**
   * Insert alert with deduplication using atomic upsert
   * Returns the alert ID (either new or existing)
   */
  async insertWithDeduplication(
    alert: Alert, 
    retryCount: number = 0
  ): Promise<{ id: number; isDuplicate: boolean }> {
    const db = getDb();
    
    // Calculate time buckets for current and previous window
    // This handles clock skew by checking adjacent buckets
    const currentBucket = this.calculateTimeBucket(alert.createdAt);
    const previousBucket = currentBucket - 1;
    
    const newAlert: NewAlert = {
      projectId: alert.projectId || null,
      alertType: alert.alertType,
      severity: alert.severity,
      message: alert.message,
      service: alert.service,
      resolved: alert.resolved,
      createdAt: alert.createdAt,
      resolvedAt: alert.resolvedAt || null,
      timeBucket: currentBucket,
    };

    try {
      // Attempt atomic insert with conflict handling
      const result = await db
        .insert(alerts)
        .values(newAlert)
        .onConflictDoUpdate({
          // Use the unique index: (service, alertType, time_bucket) WHERE resolved = false
          target: [alerts.service, alerts.alertType, alerts.timeBucket],
          where: eq(alerts.resolved, false),
          set: {
            // Update severity if higher
            severity: sql`CASE 
              WHEN ${alerts.severity}::text = 'critical' THEN ${alerts.severity}
              WHEN ${newAlert.severity}::text = 'critical' THEN ${newAlert.severity}
              WHEN ${alerts.severity}::text = 'high' AND ${newAlert.severity}::text = 'critical' THEN ${newAlert.severity}
              WHEN ${alerts.severity}::text = 'high' AND ${newAlert.severity}::text = 'high' THEN ${alerts.severity}
              WHEN ${alerts.severity}::text = 'medium' AND ${newAlert.severity}::text IN ('high', 'critical') THEN ${newAlert.severity}
              ELSE ${alerts.severity}
            END`,
            message: sql`CASE 
              WHEN ${newAlert.severity}::text = 'critical' THEN ${newAlert.message}
              WHEN ${newAlert.severity}::text = 'high' AND ${alerts.severity}::text != 'critical' THEN ${newAlert.message}
              ELSE ${alerts.message}
            END`,
            // Keep the original createdAt to preserve the first detection time
          },
        })
        .returning({ id: alerts.id, createdAt: alerts.createdAt });

      if (!result || result.length === 0) {
        throw new Error('Failed to create alert: no result returned');
      }

      // Check if this was a duplicate by comparing creation time
      const isDuplicate = Math.abs(
        result[0].createdAt.getTime() - alert.createdAt.getTime()
      ) > 100; // Threshold for detecting existing record

      return { id: result[0].id, isDuplicate };

    } catch (error) {
      // Handle unique constraint violations (race condition)
      if (this.isUniqueConstraintError(error)) {
        // Check if we've exceeded retry attempts
        if (retryCount >= ALERT_DEDUP_MAX_RETRIES) {
          // Last resort: query for the existing alert
          const existingAlert = await this.findExistingAlert(
            alert.service,
            alert.alertType,
            currentBucket,
            previousBucket
          );
          
          if (existingAlert) {
            return { id: existingAlert.id, isDuplicate: true };
          }
          
          // If we can't find it, rethrow
          throw new Error(
            `Deduplication failed after ${ALERT_DEDUP_MAX_RETRIES} retries: ${error}`
          );
        }

        // Exponential backoff before retry
        const delayMs = Math.pow(2, retryCount) * ALERT_DEDUP_RETRY_BASE_MS;
        await this.sleep(delayMs);

        // Retry with the next bucket to handle clock skew
        const skewedBucket = this.calculateTimeBucket(alert.createdAt, 1);
        const adjustedAlert = { ...alert, createdAt: alert.createdAt };
        
        return this.insertWithDeduplication(adjustedAlert, retryCount + 1);
      }

      // Re-throw non-unique-constraint errors
      throw error;
    }
  }

  /**
   * Find existing alert in current or previous bucket
   */
  private async findExistingAlert(
    service: string,
    alertType: string,
    currentBucket: number,
    previousBucket: number
  ): Promise<{ id: number } | null> {
    const db = getDb();
    
    const result = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(
          eq(alerts.service, service),
          eq(alerts.alertType, alertType as any),
          eq(alerts.resolved, false),
          sql`${alerts.timeBucket} IN (${currentBucket}, ${previousBucket})`
        )
      )
      .orderBy(desc(alerts.createdAt))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Check if error is a unique constraint violation
   */
  private isUniqueConstraintError(error: any): boolean {
    const errorCode = error?.code || error?.postgresql?.code;
    const errorMessage = error?.message || '';
    
    // PostgreSQL unique constraint violation codes
    return (
      errorCode === '23505' || // unique_violation
      errorCode === '23514' || // check_violation (for partial indexes)
      errorMessage.includes('unique') ||
      errorMessage.includes('duplicate')
    );
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

