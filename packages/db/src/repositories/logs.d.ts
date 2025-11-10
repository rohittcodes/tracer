import { LogEntry } from '@tracer/core';
export declare class LogRepository {
    /**
     * Insert a batch of logs efficiently
     */
    insertBatch(logEntries: LogEntry[]): Promise<void>;
    /**
     * Query logs by time range, optionally filtered by service
     */
    queryByTimeRange(start: Date, end: Date, service?: string, limit?: number): Promise<{
        id: number;
        timestamp: Date;
        level: "debug" | "info" | "warn" | "error" | "fatal";
        message: string;
        service: string;
        metadata: unknown;
        traceId: string | null;
        spanId: string | null;
        createdAt: Date;
    }[]>;
    /**
     * Query logs by service
     */
    queryByService(service: string, limit?: number): Promise<{
        id: number;
        timestamp: Date;
        level: "debug" | "info" | "warn" | "error" | "fatal";
        message: string;
        service: string;
        metadata: unknown;
        traceId: string | null;
        spanId: string | null;
        createdAt: Date;
    }[]>;
    /**
     * Get recent logs, optionally filtered by service
     */
    getRecentLogs(service?: string, limit?: number): Promise<{
        id: number;
        timestamp: Date;
        level: "debug" | "info" | "warn" | "error" | "fatal";
        message: string;
        service: string;
        metadata: unknown;
        traceId: string | null;
        spanId: string | null;
        createdAt: Date;
    }[]>;
    /**
     * Get a log by ID (for real-time processing via NOTIFY)
     */
    getById(id: number): Promise<LogEntry | null>;
    /**
     * Get logs by trace ID (for trace correlation)
     */
    getByTraceId(traceId: string, limit?: number): Promise<{
        id: number;
        timestamp: Date;
        level: "debug" | "info" | "warn" | "error" | "fatal";
        message: string;
        service: string;
        metadata: unknown;
        traceId: string | null;
        spanId: string | null;
        createdAt: Date;
    }[]>;
    /**
     * Get logs by span ID
     */
    getBySpanId(spanId: string, limit?: number): Promise<{
        id: number;
        timestamp: Date;
        level: "debug" | "info" | "warn" | "error" | "fatal";
        message: string;
        service: string;
        metadata: unknown;
        traceId: string | null;
        spanId: string | null;
        createdAt: Date;
    }[]>;
}
//# sourceMappingURL=logs.d.ts.map