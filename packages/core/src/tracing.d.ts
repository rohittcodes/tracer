/**
 * Generate a random 16-byte trace ID (32 hex characters)
 * Follows OpenTelemetry trace ID format
 */
export declare function generateTraceId(): string;
/**
 * Generate a random 8-byte span ID (16 hex characters)
 * Follows OpenTelemetry span ID format
 */
export declare function generateSpanId(): string;
/**
 * Extract trace context from HTTP headers (W3C Trace Context format)
 */
export declare function extractTraceContext(headers: Record<string, string | string[] | undefined>): {
    traceId?: string;
    spanId?: string;
    traceFlags?: string;
};
/**
 * Inject trace context into HTTP headers (W3C Trace Context format)
 */
export declare function injectTraceContext(traceId: string, spanId: string, traceFlags?: string): Record<string, string>;
/**
 * Parse traceparent header
 */
export declare function parseTraceParent(traceparent: string): {
    version: string;
    traceId: string;
    parentId: string;
    traceFlags: string;
} | null;
//# sourceMappingURL=tracing.d.ts.map