import { Alert } from '@tracer/core';
export declare class AlertRepository {
    /**
     * Insert a new alert
     */
    insert(alert: Alert): Promise<number>;
    /**
     * Update alert resolved status
     */
    updateResolved(id: number, resolved: boolean): Promise<void>;
    /**
     * Mark alert as sent
     */
    markAsSent(id: number, sessionId?: string): Promise<void>;
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