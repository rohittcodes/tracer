"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expressTracing = expressTracing;
const index_1 = require("../index");
const core_1 = require("@tracer/core");
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
function expressTracing(options) {
    const { tracer, ignorePaths = ['/health', '/metrics'], setAttributes } = options;
    return (req, res, next) => {
        // Skip ignored paths
        if (ignorePaths.some(path => req.path.startsWith(path))) {
            return next();
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
        const span = tracer.tracer.startSpan(`${req.method} ${req.path}`, index_1.SpanKind.SERVER, context.traceId && context.spanId ? {
            traceId: context.traceId,
            spanId: context.spanId,
        } : undefined);
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
        req.__tracerSpan = span;
        // Track response
        const originalSend = res.send;
        res.send = function (body) {
            span.setAttributes({ 'http.status_code': res.statusCode });
            if (res.statusCode >= 400) {
                span.setStatus(index_1.SpanStatus.ERROR);
            }
            else {
                span.setStatus(index_1.SpanStatus.OK);
            }
            span.end();
            return originalSend.call(this, body);
        };
        // Handle errors
        res.on('finish', () => {
            if (!res.headersSent) {
                span.setAttribute('http.status_code', res.statusCode);
                if (res.statusCode >= 400) {
                    span.setStatus(index_1.SpanStatus.ERROR);
                }
                span.end();
            }
        });
        next();
    };
}
//# sourceMappingURL=express.js.map