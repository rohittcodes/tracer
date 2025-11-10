// Optional Fastify types - install fastify if using Fastify
type FastifyRequest = any;
type FastifyReply = any;
type FastifyInstance = any;
import { TracerClient, SpanKind, SpanStatus } from '../index';
import { extractTraceContext } from '@tracer/core';

export interface FastifyTracingOptions {
  tracer: TracerClient;
  ignorePaths?: string[];
  setAttributes?: (req: FastifyRequest, span: any) => void;
}

/**
 * Fastify plugin for automatic trace instrumentation
 * 
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import { TracerClient } from '@tracer/sdk';
 * import { fastifyTracing } from '@tracer/sdk/middleware/fastify';
 * 
 * const fastify = Fastify();
 * const tracer = new TracerClient({ service: 'api', apiKey: 'key' });
 * 
 * await fastify.register(fastifyTracing, { tracer });
 * ```
 */
export function fastifyTracing(
  fastify: FastifyInstance,
  options: FastifyTracingOptions
) {
  const { tracer, ignorePaths = ['/health', '/metrics'], setAttributes } = options;

  fastify.addHook('onRequest', (req: FastifyRequest, reply: FastifyReply) => {
    // Skip ignored paths
    if (ignorePaths.some(path => req.url.startsWith(path))) {
      return;
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
      `${req.method} ${req.url}`,
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
      'http.route': req.routerPath || req.url,
      'http.user_agent': req.headers['user-agent'] || '',
      'http.status_code': 200,
    });

    // Custom attributes
    if (setAttributes) {
      setAttributes(req, span);
    }

    // Store span in request for later use
    (req as any).__tracerSpan = span;
  });

  fastify.addHook('onResponse', (req: FastifyRequest, reply: FastifyReply) => {
    const span = (req as any).__tracerSpan;
    if (!span) return;

    span.setAttribute('http.status_code', reply.statusCode);
    
    if (reply.statusCode >= 400) {
      span.setStatus(SpanStatus.ERROR);
    } else {
      span.setStatus(SpanStatus.OK);
    }

    span.end();
  });

  fastify.addHook('onError', (req: FastifyRequest, reply: FastifyReply, error: Error) => {
    const span = (req as any).__tracerSpan;
    if (!span) return;

    span.setStatus(SpanStatus.ERROR);
    span.setAttributes({
      'error.message': error.message,
      'error.stack': error.stack || '',
    });
    span.end();
  });
}

