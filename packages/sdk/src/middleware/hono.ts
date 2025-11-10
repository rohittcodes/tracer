// Optional Hono types - install hono if using Hono
type HonoContext = any;
type HonoNext = any;
import { TracerClient, SpanKind, SpanStatus } from '../index';
import { extractTraceContext } from '@tracer/core';

export interface HonoTracingOptions {
  tracer: TracerClient;
  ignorePaths?: string[];
  setAttributes?: (c: HonoContext, span: any) => void;
}

/**
 * Hono middleware for automatic trace instrumentation
 * 
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { TracerClient } from '@tracer/sdk';
 * import { honoTracing } from '@tracer/sdk/middleware/hono';
 * 
 * const app = new Hono();
 * const tracer = new TracerClient({ service: 'api', apiKey: 'key' });
 * 
 * app.use('*', honoTracing({ tracer }));
 * ```
 */
export function honoTracing(options: HonoTracingOptions) {
  const { tracer, ignorePaths = ['/health', '/metrics'], setAttributes } = options;

  return async (c: HonoContext, next: HonoNext) => {
    // Skip ignored paths
    if (ignorePaths.some(path => c.req.path.startsWith(path))) {
      return next();
    }

    // Extract trace context from incoming request
    const headers: Record<string, string> = {};
    const headerObj = c.req.header();
    if (headerObj && typeof headerObj === 'object') {
      Object.entries(headerObj).forEach(([key, value]: [string, any]) => {
        headers[key] = String(value);
      });
    }

    const context = extractTraceContext(headers);
    
    // Start span for this request
    const span = tracer.tracer.startSpan(
      `${c.req.method} ${c.req.path}`,
      SpanKind.SERVER,
      context.traceId && context.spanId ? {
        traceId: context.traceId,
        spanId: context.spanId,
      } : undefined
    );

    // Set HTTP attributes
    span.setAttributes({
      'http.method': c.req.method,
      'http.url': c.req.url,
      'http.route': c.req.path,
      'http.user_agent': c.req.header('user-agent') || '',
      'http.status_code': 200,
    });

    // Custom attributes
    if (setAttributes) {
      setAttributes(c, span);
    }

    // Store span in context
    c.set('__tracerSpan', span);

    // Run the rest of the request in the span's async context
    try {
      await tracer.tracer.runInSpan(span, async () => {
        await next();
      });
      
      // Update status based on response
      const status = c.res.status;
      span.setAttribute('http.status_code', status);
      
      if (status >= 400) {
        span.setStatus(SpanStatus.ERROR);
      } else {
        span.setStatus(SpanStatus.OK);
      }
    } catch (error) {
      span.setStatus(SpanStatus.ERROR);
      span.setAttributes({
        'error.message': (error as Error).message,
        'error.stack': (error as Error).stack || '',
      });
      throw error;
    } finally {
      span.end();
    }
  };
}

