"use strict";
// Distributed Tracing Utilities
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTraceId = generateTraceId;
exports.generateSpanId = generateSpanId;
exports.extractTraceContext = extractTraceContext;
exports.injectTraceContext = injectTraceContext;
exports.parseTraceParent = parseTraceParent;
/**
 * Generate a random 16-byte trace ID (32 hex characters)
 * Follows OpenTelemetry trace ID format
 */
function generateTraceId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
/**
 * Generate a random 8-byte span ID (16 hex characters)
 * Follows OpenTelemetry span ID format
 */
function generateSpanId() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
/**
 * Extract trace context from HTTP headers (W3C Trace Context format)
 */
function extractTraceContext(headers) {
    const traceparent = Array.isArray(headers['traceparent'])
        ? headers['traceparent'][0]
        : headers['traceparent'];
    if (!traceparent) {
        return {};
    }
    // Parse W3C traceparent format: version-trace-id-parent-id-trace-flags
    // Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
    const parts = traceparent.split('-');
    if (parts.length !== 4) {
        return {};
    }
    return {
        traceId: parts[1],
        spanId: parts[2],
        traceFlags: parts[3],
    };
}
/**
 * Inject trace context into HTTP headers (W3C Trace Context format)
 */
function injectTraceContext(traceId, spanId, traceFlags = '01') {
    // W3C traceparent format: version-trace-id-parent-id-trace-flags
    return {
        traceparent: `00-${traceId}-${spanId}-${traceFlags}`,
    };
}
/**
 * Parse traceparent header
 */
function parseTraceParent(traceparent) {
    const parts = traceparent.split('-');
    if (parts.length !== 4) {
        return null;
    }
    return {
        version: parts[0],
        traceId: parts[1],
        parentId: parts[2],
        traceFlags: parts[3],
    };
}
//# sourceMappingURL=tracing.js.map