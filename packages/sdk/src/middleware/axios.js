"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.axiosTracing = axiosTracing;
const index_1 = require("../index");
/**
 * Axios interceptor for automatic trace propagation
 *
 * @example
 * ```typescript
 * import axios from 'axios';
 * import { TracerClient } from '@tracer/sdk';
 * import { axiosTracing } from '@tracer/sdk/middleware/axios';
 *
 * const tracer = new TracerClient({ service: 'api', apiKey: 'key' });
 * const client = axios.create();
 * axiosTracing(client, tracer);
 *
 * // Now all axios requests automatically include trace context
 * await client.get('https://api.example.com/users');
 * ```
 */
function axiosTracing(axiosInstance, tracer) {
    // Request interceptor
    axiosInstance.interceptors.request.use((config) => {
        const currentSpan = tracer.tracer.getCurrentSpan();
        if (!currentSpan) {
            return config;
        }
        // Create a child span for the HTTP request
        const span = tracer.tracer.startSpan(`HTTP ${config.method?.toUpperCase()} ${config.url}`, index_1.SpanKind.CLIENT, currentSpan.getContext());
        span.setAttributes({
            'http.method': config.method?.toUpperCase() || 'GET',
            'http.url': config.url || '',
        });
        // Inject trace context into headers
        const traceHeaders = currentSpan.getTraceHeaders();
        config.headers = {
            ...config.headers,
            ...traceHeaders,
        };
        // Store span in config for response interceptor
        config.__tracerSpan = span;
        return config;
    }, (error) => {
        return Promise.reject(error);
    });
    // Response interceptor
    axiosInstance.interceptors.response.use((response) => {
        const span = response.config.__tracerSpan;
        if (span) {
            span.setAttribute('http.status_code', response.status);
            span.setStatus(index_1.SpanStatus.OK);
            span.end();
        }
        return response;
    }, (error) => {
        const span = error.config?.__tracerSpan;
        if (span) {
            span.setAttributes({
                'http.status_code': error.response?.status || 0,
                'error.message': error.message,
                ...(error.response?.data && { 'error.response': JSON.stringify(error.response.data) }),
            });
            span.setStatus(index_1.SpanStatus.ERROR);
            span.end();
        }
        return Promise.reject(error);
    });
}
//# sourceMappingURL=axios.js.map