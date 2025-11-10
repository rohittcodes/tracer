/**
 * Context compression utilities to reduce token usage
 * Compresses observability data before sending to LLMs
 */

export interface CompressionOptions {
  maxStringLength?: number;
  maxArrayItems?: number;
  maxObjectDepth?: number;
  removeMetadata?: boolean;
  summarizeArrays?: boolean;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxStringLength: 500,
  maxArrayItems: 20,
  maxObjectDepth: 3,
  removeMetadata: false,
  summarizeArrays: true,
};

/**
 * Compress a string to a maximum length
 */
export function compressString(str: string, maxLength: number = DEFAULT_OPTIONS.maxStringLength): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Compress an array by limiting items and summarizing
 */
export function compressArray<T>(
  arr: T[],
  options: CompressionOptions = {}
): { items: T[]; total: number; summary?: string } {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (arr.length <= opts.maxArrayItems) {
    return { items: arr, total: arr.length };
  }

  const items = arr.slice(0, opts.maxArrayItems);
  const remaining = arr.length - opts.maxArrayItems;

  return {
    items,
    total: arr.length,
    summary: `... and ${remaining} more items (showing first ${opts.maxArrayItems})`,
  };
}

/**
 * Compress log entries for AI analysis
 */
export function compressLogs(logs: any[], options: CompressionOptions = {}): any[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const compressed = compressArray(logs, opts);

  return compressed.items.map((log: any) => ({
    timestamp: log.timestamp,
    level: log.level,
    service: log.service,
    message: compressString(log.message, opts.maxStringLength),
    ...(opts.removeMetadata ? {} : {
      metadata: compressObject(log.metadata || {}, opts),
    }),
    ...(log.traceId ? { traceId: log.traceId } : {}),
  }));
}

/**
 * Compress span data for AI analysis
 */
export function compressSpans(spans: any[], options: CompressionOptions = {}): any[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const compressed = compressArray(spans, opts);

  return compressed.items.map((span: any) => ({
    spanId: span.spanId,
    name: compressString(span.name, 100),
    service: span.service,
    kind: span.kind,
    status: span.status,
    duration: span.duration,
    ...(opts.removeMetadata ? {} : {
      attributes: compressObject(span.attributes || {}, { ...opts, maxObjectDepth: 2 }),
    }),
  }));
}

/**
 * Compress object by limiting depth and string lengths
 */
export function compressObject(
  obj: any,
  options: CompressionOptions = {},
  depth: number = 0
): any {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (depth >= opts.maxObjectDepth) {
    return '[object truncated]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return compressString(obj, opts.maxStringLength);
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    const compressed = compressArray(obj, opts);
    return compressed.items.map((item: any) => compressObject(item, opts, depth + 1));
  }

  const compressed: any = {};
  const keys = Object.keys(obj);
  const maxKeys = Math.min(keys.length, 10); // Limit to 10 keys per object

  for (let i = 0; i < maxKeys; i++) {
    const key = keys[i];
    compressed[key] = compressObject(obj[key], opts, depth + 1);
  }

  if (keys.length > maxKeys) {
    compressed['_truncated'] = `${keys.length - maxKeys} more keys`;
  }

  return compressed;
}

/**
 * Create a summary of trace data for AI analysis
 */
export function compressTraceData(trace: any, options: CompressionOptions = {}): any {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const spans = trace.spans || [];
  const errorSpans = spans.filter((s: any) => s.status === 'error');
  const slowSpans = spans
    .filter((s: any) => s.duration && s.duration > 1000)
    .sort((a: any, b: any) => (b.duration || 0) - (a.duration || 0));

  return {
    traceId: trace.traceId,
    service: trace.service,
    duration: trace.duration,
    errorCount: trace.errorCount,
    spanCount: spans.length,
    errorSpans: compressSpans(errorSpans, { ...opts, maxArrayItems: 5 }),
    slowSpans: compressSpans(slowSpans, { ...opts, maxArrayItems: 5 }),
    // Only include top-level span info, not full details
    topSpans: compressSpans(spans.slice(0, 10), { ...opts, maxArrayItems: 10, removeMetadata: true }),
  };
}

/**
 * Create a summary of log data for AI analysis
 */
export function compressLogData(logs: any[], options: CompressionOptions = {}): any {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const compressed = compressArray(logs, opts);
  const byLevel: Record<string, number> = {};
  const byService: Record<string, number> = {};

  compressed.items.forEach((log: any) => {
    byLevel[log.level] = (byLevel[log.level] || 0) + 1;
    byService[log.service] = (byService[log.service] || 0) + 1;
  });

  return {
    total: compressed.total,
    shown: compressed.items.length,
    summary: compressed.summary,
    byLevel,
    byService,
    sampleLogs: compressLogs(compressed.items, opts),
  };
}

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 characters)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Compress context to fit within token limit
 */
export function compressToTokenLimit(
  data: any,
  maxTokens: number,
  options: CompressionOptions = {}
): any {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let currentTokens = estimateTokens(JSON.stringify(data));

  if (currentTokens <= maxTokens) {
    return data;
  }

  // Aggressively compress (don't merge opts to avoid overwriting)
  const aggressiveOptions: CompressionOptions = {
    maxStringLength: Math.floor(opts.maxStringLength * 0.5),
    maxArrayItems: Math.floor(opts.maxArrayItems * 0.5),
    maxObjectDepth: Math.max(1, opts.maxObjectDepth - 1),
    removeMetadata: true,
    summarizeArrays: true,
  };

  return compressObject(data, aggressiveOptions);
}

