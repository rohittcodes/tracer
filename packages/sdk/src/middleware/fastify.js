"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fastifyTracing = fastifyTracing;
const index_1 = require("../index");
const core_1 = require("@tracer/core");
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
function fastifyTracing(fastify, options) {
    const { tracer, ignorePaths = ['/health', '/metrics'], setAttributes } = options;
    fastify.addHook('onRequest', (req, reply) => {
        // Skip ignored paths
        if (ignorePaths.some(path => req.url.startsWith(path))) {
            return;
        }
        // Extract trace context from incoming request
        const headers = {};
        Object.keys(req.headers).forEach(key => {
            const value = req.headers[key];
            if (typeof value === 'string') {
                headers[key] = value;
            }
            else if (Array.isArray(value) && value.length > 0) {
                headers[key] = value[0];
            }
        });
        const context = (0, core_1.extractTraceContext)(headers);
        // Start span for this request
        const span = tracer.tracer.startSpan(`${req.method} ${req.url}`, index_1.SpanKind.SERVER, context.traceId && context.spanId ? {
            traceId: context.traceId,
            spanId: context.spanId,
        } : undefined);
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
        req.__tracerSpan = span;
    });
    fastify.addHook('onResponse', (req, reply) => {
        const span = req.__tracerSpan;
        if (!span)
            return;
        span.setAttribute('http.status_code', reply.statusCode);
        if (reply.statusCode >= 400) {
            span.setStatus(index_1.SpanStatus.ERROR);
        }
        else {
            span.setStatus(index_1.SpanStatus.OK);
        }
        span.end();
    });
    fastify.addHook('onError', (req, reply, error) => {
        const span = req.__tracerSpan;
        if (!span)
            return;
        span.setStatus(index_1.SpanStatus.ERROR);
        span.setAttributes({
            'error.message': error.message,
            'error.stack': error.stack || '',
        });
        span.end();
    });
}
//# sourceMappingURL=fastify.js.map