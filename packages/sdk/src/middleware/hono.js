"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.honoTracing = honoTracing;
const index_1 = require("../index");
const core_1 = require("@tracer/core");
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
function honoTracing(options) {
    const { tracer, ignorePaths = ['/health', '/metrics'], setAttributes } = options;
    return async (c, next) => {
        // Skip ignored paths
        if (ignorePaths.some(path => c.req.path.startsWith(path))) {
            return next();
        }
        // Extract trace context from incoming request
        const headers = {};
        const headerObj = c.req.header();
        if (headerObj && typeof headerObj === 'object') {
            Object.entries(headerObj).forEach(([key, value]) => {
                headers[key] = String(value);
            });
        }
        const context = (0, core_1.extractTraceContext)(headers);
        // Start span for this request
        const span = tracer.tracer.startSpan(`${c.req.method} ${c.req.path}`, index_1.SpanKind.SERVER, context.traceId && context.spanId ? {
            traceId: context.traceId,
            spanId: context.spanId,
        } : undefined);
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
                span.setStatus(index_1.SpanStatus.ERROR);
            }
            else {
                span.setStatus(index_1.SpanStatus.OK);
            }
        }
        catch (error) {
            span.setStatus(index_1.SpanStatus.ERROR);
            span.setAttributes({
                'error.message': error.message,
                'error.stack': error.stack || '',
            });
            throw error;
        }
        finally {
            span.end();
        }
    };
}
//# sourceMappingURL=hono.js.map