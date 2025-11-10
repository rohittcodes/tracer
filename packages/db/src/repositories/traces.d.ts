import { Trace, Span } from '@tracer/core';
export declare class TraceRepository {
    /**
     * Insert a new trace
     */
    insertTrace(trace: Trace): Promise<number>;
    /**
     * Insert a span
     */
    insertSpan(span: Span): Promise<number>;
    /**
     * Insert multiple spans in a batch
     */
    insertSpansBatch(spanList: Span[]): Promise<void>;
    /**
     * Get a trace by trace ID with all spans
     */
    getByTraceId(traceId: string): Promise<Trace | null>;
    /**
     * Get recent traces, optionally filtered by service
     */
    getRecentTraces(service?: string, limit?: number): Promise<{
        id: number;
        traceId: string;
        service: string;
        startTime: Date;
        endTime: Date | null;
        duration: number | null;
        spanCount: number;
        errorCount: number;
        rootSpanId: string | null;
        createdAt: Date;
    }[]>;
    /**
     * Query traces by time range
     */
    queryByTimeRange(start: Date, end: Date, service?: string, limit?: number): Promise<{
        id: number;
        traceId: string;
        service: string;
        startTime: Date;
        endTime: Date | null;
        duration: number | null;
        spanCount: number;
        errorCount: number;
        rootSpanId: string | null;
        createdAt: Date;
    }[]>;
    /**
     * Update trace end time and duration
     */
    updateTraceEnd(traceId: string, endTime: Date, duration: number): Promise<void>;
    /**
     * Update span end time and duration
     */
    updateSpanEnd(spanId: string, endTime: Date, duration: number, status?: string): Promise<void>;
    /**
     * Get service dependencies from trace data
     * Analyzes spans to find service-to-service calls
     */
    getServiceDependencies(timeWindowHours?: number): Promise<Array<{
        from: string;
        to: string;
        callCount: number;
        errorCount: number;
        avgDuration: number;
    }>>;
    /**
     * Search traces by various criteria
     */
    searchTraces(filters: {
        service?: string;
        hasErrors?: boolean;
        minDuration?: number;
        maxDuration?: number;
        startTime?: Date;
        endTime?: Date;
        spanAttributes?: Record<string, any>;
        spanName?: string;
        limit?: number;
    }): Promise<any[]>;
}
//# sourceMappingURL=traces.d.ts.map