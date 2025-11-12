import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { alerts, NewAlert } from '../schema';
import { Alert, Severity } from '@tracer/core';

export type DedupeInsertOutcome = 'created' | 'updated' | 'skipped';

export interface DedupeInsertResult {
  outcome: DedupeInsertOutcome;
  alertId?: number;
}

const DEFAULT_DEDUPE_WINDOW_MS = 8000; // 5s window + 3s skew tolerance

const SEVERITY_RANK: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export class AlertRepository {
  /**
   * Insert a new alert
   */
  async insert(alert: Alert): Promise<number> {
    const db = getDb();
    const result = await db.insert(alerts).values(this.mapToNewAlert(alert)).returning({ id: alerts.id });
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
   * Insert an alert while enforcing a short-lived deduplication window.
   * Returns whether a new alert was created, an existing alert was updated,
   * or the incoming alert was skipped because an equal-or-higher severity alert already exists.
   */
  async insertWithDedupe(
    alert: Alert,
    dedupeKey: string,
    dedupeWindowMs: number = DEFAULT_DEDUPE_WINDOW_MS,
  ): Promise<DedupeInsertResult> {
    const db = getDb();

    return db.transaction(async (tx) => {
      // Remove stale reservation for this key
      await tx.execute(sql`
        DELETE FROM alert_dedupe
        WHERE dedupe_key = ${dedupeKey} AND expires_at < NOW()
      `);

      // Attempt to reserve the dedupe slot
      const reservation = await tx.execute(sql`
        INSERT INTO alert_dedupe (dedupe_key, expires_at)
        VALUES (${dedupeKey}, NOW() + (${dedupeWindowMs} * INTERVAL '1 millisecond'))
        ON CONFLICT (dedupe_key)
        DO UPDATE SET expires_at = EXCLUDED.expires_at
        WHERE alert_dedupe.expires_at < NOW()
        RETURNING dedupe_key
      `);

      if (reservation.rows.length === 0) {
        // Another processor already owns the slot in the current window
        const existingSlot = await tx.execute(sql`
          SELECT alert_id
          FROM alert_dedupe
          WHERE dedupe_key = ${dedupeKey}
          LIMIT 1
          FOR UPDATE
        `);

        const existingAlertId = existingSlot.rows[0]?.alert_id as number | undefined;

        if (!existingAlertId) {
          // Slot exists but no alert recorded (likely stale); clear it so the next attempt can recreate
          await tx.execute(sql`
            DELETE FROM alert_dedupe
            WHERE dedupe_key = ${dedupeKey}
          `);
          return { outcome: 'skipped' };
        }

        const currentAlert = await tx.execute(sql`
          SELECT id, severity
          FROM alerts
          WHERE id = ${existingAlertId}
          LIMIT 1
          FOR UPDATE
        `);

        if (currentAlert.rows.length === 0) {
          await tx.execute(sql`
            DELETE FROM alert_dedupe
            WHERE dedupe_key = ${dedupeKey}
          `);
          return { outcome: 'skipped' };
        }

        const currentSeverity = String(currentAlert.rows[0].severity ?? '');
        const incomingLevel = this.getSeverityLevel(alert.severity);
        const existingLevel = this.getSeverityLevel(currentSeverity);

        if (incomingLevel > existingLevel) {
          await tx.execute(sql`
            UPDATE alerts
            SET severity = ${alert.severity},
                message = ${alert.message},
                resolved = FALSE,
                resolved_at = NULL
            WHERE id = ${existingAlertId}
          `);

          await tx.execute(sql`
            UPDATE alert_dedupe
            SET alert_id = ${existingAlertId},
                expires_at = NOW() + (${dedupeWindowMs} * INTERVAL '1 millisecond')
            WHERE dedupe_key = ${dedupeKey}
          `);

          return { outcome: 'updated', alertId: existingAlertId };
        }

        await tx.execute(sql`
          UPDATE alert_dedupe
          SET alert_id = ${existingAlertId},
              expires_at = NOW() + (${dedupeWindowMs} * INTERVAL '1 millisecond')
          WHERE dedupe_key = ${dedupeKey}
        `);

        return { outcome: 'skipped', alertId: existingAlertId };
      }

      const inserted = await tx.insert(alerts).values(this.mapToNewAlert(alert)).returning({ id: alerts.id });
      if (!inserted || inserted.length === 0) {
        throw new Error('Failed to create alert: no result returned');
      }

      const alertId = inserted[0].id;

      await tx.execute(sql`
        UPDATE alert_dedupe
        SET alert_id = ${alertId}
        WHERE dedupe_key = ${dedupeKey}
      `);

      return { outcome: 'created', alertId };
    });
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

  private mapToNewAlert(alert: Alert): NewAlert {
    return {
      projectId: alert.projectId || null,
      alertType: alert.alertType,
      severity: alert.severity,
      message: alert.message,
      service: alert.service,
      resolved: alert.resolved,
      createdAt: alert.createdAt,
      resolvedAt: alert.resolvedAt || null,
    };
  }

  private getSeverityLevel(severity: Severity | string | null | undefined): number {
    if (!severity || typeof severity !== 'string') {
      return 0;
    }
    return SEVERITY_RANK[severity.toLowerCase()] ?? 0;
  }
}
