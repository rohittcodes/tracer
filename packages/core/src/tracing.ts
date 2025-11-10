// Distributed Tracing Utilities

/**
 * Generate a random 16-byte trace ID (32 hex characters)
 * Follows OpenTelemetry trace ID format
 */
export function generateTraceId(): string {
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
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Extract trace context from HTTP headers (W3C Trace Context format)
 */
export function extractTraceContext(headers: Record<string, string | string[] | undefined>): {
  traceId?: string;
  spanId?: string;
  traceFlags?: string;
} {
  const traceparent = Array.isArray(headers['traceparent'])
    ? headers['traceparent'][0]
    : headers['traceparent'];

  if (!traceparent) {
    return {};
  }

  // Parse W3C traceparent format: version-trace-id-parent-id-trace-flags
  // Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
  if (!traceparent || typeof traceparent !== 'string') {
    return {};
  }
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
export function injectTraceContext(
  traceId: string,
  spanId: string,
  traceFlags: string = '01'
): Record<string, string> {
  // W3C traceparent format: version-trace-id-parent-id-trace-flags
  return {
    traceparent: `00-${traceId}-${spanId}-${traceFlags}`,
  };
}

/**
 * Parse traceparent header
 */
export function parseTraceParent(traceparent: string): {
  version: string;
  traceId: string;
  parentId: string;
  traceFlags: string;
} | null {
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

