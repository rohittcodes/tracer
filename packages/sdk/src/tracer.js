"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tracer = exports.ActiveSpan = void 0;
const core_1 = require("@tracer/core");
const async_hooks_1 = require("async_hooks");
/**
 * ActiveSpan manages a span's lifecycle
 */
class ActiveSpan {
    span;
    tracer;
    ended = false;
    constructor(span, tracer) {
        this.span = span;
        this.tracer = tracer;
    }
    /**
     * Set an attribute on the span
     */
    setAttribute(key, value) {
        if (!this.span.attributes) {
            this.span.attributes = {};
        }
        this.span.attributes[key] = value;
    }
    /**
     * Set multiple attributes on the span
     */
    setAttributes(attributes) {
        if (!this.span.attributes) {
            this.span.attributes = {};
        }
        Object.assign(this.span.attributes, attributes);
    }
    /**
     * Add an event to the span
     */
    addEvent(name, attributes) {
        if (!this.span.events) {
            this.span.events = [];
        }
        this.span.events.push({
            name,
            timestamp: new Date(),
            attributes,
        });
    }
    /**
     * Set the span status
     */
    setStatus(status) {
        this.span.status = status;
    }
    /**
     * End the span
     */
    end() {
        if (this.ended) {
            return;
        }
        this.ended = true;
        this.span.endTime = new Date();
        this.span.duration = this.span.endTime.getTime() - this.span.startTime.getTime();
        this.tracer.endSpan(this);
    }
    /**
     * Get the span context for propagation
     */
    getContext() {
        return {
            traceId: this.span.traceId,
            spanId: this.span.spanId,
            parentSpanId: this.span.parentSpanId,
        };
    }
    /**
     * Get trace context headers for HTTP propagation
     */
    getTraceHeaders() {
        return (0, core_1.injectTraceContext)(this.span.traceId, this.span.spanId);
    }
    get spanId() {
        return this.span.spanId;
    }
    get traceId() {
        return this.span.traceId;
    }
    getSpan() {
        return { ...this.span };
    }
}
exports.ActiveSpan = ActiveSpan;
/**
 * Tracer manages distributed tracing
 */
class Tracer {
    client;
    activeSpans = new Map();
    spanBuffer = [];
    batchSize = 50;
    flushInterval = 5000;
    flushTimer;
    sampleRate;
    alwaysSampleErrors;
    maxBufferSize = 10000; // Prevent unbounded growth
    asyncContext = new async_hooks_1.AsyncLocalStorage();
    constructor(client, config = {}) {
        this.client = client;
        this.sampleRate = config.sampleRate ?? 1.0; // Default: 100% sampling
        this.alwaysSampleErrors = config.alwaysSampleErrors ?? true;
        this.startAutoFlush();
    }
    /**
     * Check if a span should be sampled
     */
    shouldSample(span) {
        // Always sample errors if configured
        if (this.alwaysSampleErrors && span.status === core_1.SpanStatus.ERROR) {
            return true;
        }
        // Use sample rate
        return Math.random() < this.sampleRate;
    }
    /**
     * Start a new span
     */
    startSpan(name, kind = core_1.SpanKind.INTERNAL, parentContext) {
        const traceId = parentContext?.traceId || (0, core_1.generateTraceId)();
        const spanId = (0, core_1.generateSpanId)();
        const parentSpanId = parentContext?.spanId;
        const span = {
            traceId,
            spanId,
            parentSpanId,
            name,
            kind,
            service: this.client.service,
            startTime: new Date(),
            status: core_1.SpanStatus.UNSET,
        };
        const activeSpan = new ActiveSpan(span, this);
        this.activeSpans.set(spanId, activeSpan);
        // Store in async context for proper async propagation
        // Use enterWith to set context for current execution
        this.asyncContext.enterWith(activeSpan);
        return activeSpan;
    }
    /**
     * Run a function in the context of a span
     * This ensures getCurrentSpan() works correctly in async contexts
     */
    runInSpan(span, fn) {
        return this.asyncContext.run(span, fn);
    }
    /**
     * End a span (called by ActiveSpan)
     */
    endSpan(activeSpan) {
        const span = activeSpan.getSpan();
        this.activeSpans.delete(span.spanId);
        // Apply sampling
        if (!this.shouldSample(span)) {
            return; // Don't send span if not sampled
        }
        // Prevent unbounded buffer growth
        if (this.spanBuffer.length >= this.maxBufferSize) {
            console.warn(`Span buffer full (${this.maxBufferSize}), dropping oldest spans`);
            // Remove oldest spans to make room
            const toRemove = this.spanBuffer.length - this.maxBufferSize + 1;
            this.spanBuffer.splice(0, toRemove);
        }
        this.spanBuffer.push(span);
        if (this.spanBuffer.length >= this.batchSize) {
            this.flushSpans();
        }
    }
    /**
     * Get the current active span from async context
     * This works correctly across async boundaries
     */
    getCurrentSpan() {
        // First try async context (works across async boundaries)
        const contextSpan = this.asyncContext.getStore();
        if (contextSpan) {
            return contextSpan;
        }
        // Fallback to most recently started span (for backwards compatibility)
        // This is not reliable in concurrent scenarios but better than nothing
        const spans = Array.from(this.activeSpans.values());
        return spans.length > 0 ? spans[spans.length - 1] : undefined;
    }
    /**
     * Flush spans to the API
     */
    async flushSpans() {
        if (this.spanBuffer.length === 0) {
            return;
        }
        const spansToSend = [...this.spanBuffer];
        this.spanBuffer = [];
        try {
            const headers = {
                'Content-Type': 'application/json',
            };
            // Access private properties via type assertion (they're needed for API calls)
            const apiKey = this.client.apiKey;
            const apiUrl = this.client.apiUrl;
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }
            const response = await fetch(`${apiUrl}/traces/spans`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ spans: spansToSend }),
            });
            if (!response.ok) {
                throw new Error(`Failed to send spans: ${response.statusText}`);
            }
        }
        catch (error) {
            console.error('Failed to send spans to Tracer API:', error);
            // Re-add spans to buffer for retry, but limit total size
            const availableSpace = this.maxBufferSize - this.spanBuffer.length;
            if (availableSpace > 0) {
                const toReAdd = spansToSend.slice(0, availableSpace);
                this.spanBuffer.unshift(...toReAdd);
                if (spansToSend.length > availableSpace) {
                    console.warn(`Dropped ${spansToSend.length - availableSpace} spans due to buffer limit`);
                }
            }
            else {
                console.warn(`Buffer full, dropping ${spansToSend.length} spans`);
            }
        }
    }
    startAutoFlush() {
        this.flushTimer = setInterval(() => {
            this.flushSpans().catch((error) => {
                console.error('Auto-flush spans failed:', error);
            });
        }, this.flushInterval);
    }
    async shutdown() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
        // End all active spans
        for (const span of this.activeSpans.values()) {
            span.end();
        }
        await this.flushSpans();
    }
}
exports.Tracer = Tracer;
//# sourceMappingURL=tracer.js.map