import { eq, and, desc, gte } from 'drizzle-orm';
import { getDb, getPool } from '../db';
import { alerts, NewAlert, type Alert as DbAlert } from '../schema';
import { Alert as CoreAlert } from '@tracer/core';

export class AlertRepository {
  /**
   * Insert a new alert
   */
  async insert(alert: CoreAlert): Promise<number> {
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
   * Returns the current timestamp from the database server.
   * Using server time avoids skew between processors.
   */
  async getServerTimestamp(): Promise<Date> {
    const pool = getPool();
    const result = await pool.query<{ now: Date | string }>('SELECT NOW() AS now');
    const raw = result.rows[0]?.now;
    if (!raw) {
      throw new Error('Failed to fetch server timestamp');
    }
    return raw instanceof Date ? raw : new Date(raw);
  }

  /**
   * Return the most recent active alert for a service/type within a time window.
   */
  async getRecentActiveAlert(
    service: string,
    alertType: CoreAlert['alertType'],
    since: Date
  ): Promise<DbAlert | null> {
    const db = getDb();
    const matches = await db
      .select()
      .from(alerts)
      .where(
        and(
          eq(alerts.service, service),
          eq(alerts.alertType, alertType as any),
          eq(alerts.resolved, false),
          gte(alerts.createdAt, since)
        )
      )
      .orderBy(desc(alerts.createdAt))
      .limit(1);

    return matches.length > 0 ? matches[0] : null;
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
  async update(id: number, data: Partial<Pick<CoreAlert, 'severity' | 'message' | 'resolved' | 'resolvedAt'>>): Promise<void> {
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
}

