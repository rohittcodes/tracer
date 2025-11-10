// Optional Express types - install @types/express if using Express
type ExpressRequest = any;
type ExpressResponse = any;
type ExpressNextFunction = any;
import { TracerClient, SpanKind, SpanStatus } from '../index';
import { extractTraceContext } from '@tracer/core';

export interface ExpressTracingOptions {
  tracer: TracerClient;
  ignorePaths?: string[];
  setAttributes?: (req: ExpressRequest, span: any) => void;
}

/**
 * Express middleware for automatic trace instrumentation
 * 
 * @example
 * ```typescript
 * import express from 'express';
 * import { TracerClient } from '@tracer/sdk';
 * import { expressTracing } from '@tracer/sdk/middleware/express';
 * 
 * const app = express();
 * const tracer = new TracerClient({ service: 'api', apiKey: 'key' });
 * 
 * app.use(expressTracing({ tracer }));
 * ```
 */
export function expressTracing(options: ExpressTracingOptions) {
  const { tracer, ignorePaths = ['/health', '/metrics'], setAttributes } = options;

  return (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => {
    // Skip ignored paths
    if (ignorePaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Extract trace context from incoming request
    const headers: Record<string, string> = {};
    Object.keys(req.headers).forEach(key => {
      const value = req.headers[key];
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value) && value.length > 0) {
        headers[key] = value[0];
      }
    });

    const context = extractTraceContext(headers);
    
    // Start span for this request
    const span = tracer.tracer.startSpan(
      `${req.method} ${req.path}`,
      SpanKind.SERVER,
      context.traceId && context.spanId ? {
        traceId: context.traceId,
        spanId: context.spanId,
      } : undefined
    );

    // Set HTTP attributes
    span.setAttributes({
      'http.method': req.method,
      'http.url': req.url,
      'http.route': req.route?.path || req.path,
      'http.user_agent': req.get('user-agent') || '',
      'http.status_code': 200, // Will be updated when response is sent
    });

    // Custom attributes
    if (setAttributes) {
      setAttributes(req, span);
    }

    // Store span in request for later use
    (req as any).__tracerSpan = span;

    // Track response
    const originalSend = res.send;
    res.send = function(body: any) {
      span.setAttributes({ 'http.status_code': res.statusCode });
      
      if (res.statusCode >= 400) {
        span.setStatus(SpanStatus.ERROR);
      } else {
        span.setStatus(SpanStatus.OK);
      }

      span.end();
      return originalSend.call(this, body);
    };

    // Handle errors
    res.on('finish', () => {
      if (!res.headersSent) {
        span.setAttribute('http.status_code', res.statusCode);
        if (res.statusCode >= 400) {
          span.setStatus(SpanStatus.ERROR);
        }
        span.end();
      }
    });

    next();
  };
}

