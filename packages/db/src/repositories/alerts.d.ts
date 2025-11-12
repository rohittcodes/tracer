import { Alert } from '@tracer/core';
export type DedupeInsertOutcome = 'created' | 'updated' | 'skipped';
export interface DedupeInsertResult {
    outcome: DedupeInsertOutcome;
    alertId?: number;
}
export declare class AlertRepository {
    /**
     * Insert a new alert
     */
    insert(alert: Alert): Promise<number>;
    /**
     * Insert an alert while enforcing a short-lived dedupe window.
     */
    insertWithDedupe(alert: Alert, dedupeKey: string, dedupeWindowMs?: number): Promise<DedupeInsertResult>;
    /**
     * Update alert resolved status
     */
    updateResolved(id: number, resolved: boolean): Promise<void>;
    /**
     * Update alert with new data (severity/message/resolution)
     */
    update(id: number, data: Partial<Pick<Alert, 'severity' | 'message' | 'resolved' | 'resolvedAt'>>): Promise<void>;
    /**
     * Mark alert as sent
     */
    markAsSent(id: number, sessionId?: string): Promise<void>;
    /**
     * Get the last sent alert time for rate limiting
     */
    getLastSentTime(service: string, alertType: string, projectId?: number): Promise<Date | null>;
    /**
     * Get recent unsent alerts for batching
     */
    getRecentUnsentAlerts(service: string, alertType: string, projectId?: number, windowMinutes?: number): Promise<any[]>;
    /**
     * Get active (unresolved) alerts, optionally filtered by service
     */
    getActiveAlerts(service?: string): Promise<{
        id: number;
        alertType: "error_spike" | "high_latency" | "service_down" | "threshold_exceeded";
        severity: "low" | "medium" | "high" | "critical";
        message: string;
        service: string;
        resolved: boolean;
        createdAt: Date;
        resolvedAt: Date | null;
        toolRouterSessionId: string | null;
        alertSent: boolean;
    }[]>;
    /**
     * Get recent alerts, optionally filtered by service
     */
    getRecentAlerts(limit?: number, service?: string): Promise<{
        id: number;
        alertType: "error_spike" | "high_latency" | "service_down" | "threshold_exceeded";
        severity: "low" | "medium" | "high" | "critical";
        message: string;
        service: string;
        resolved: boolean;
        createdAt: Date;
        resolvedAt: Date | null;
        toolRouterSessionId: string | null;
        alertSent: boolean;
    }[]>;
}
//# sourceMappingURL=alerts.d.ts.map
