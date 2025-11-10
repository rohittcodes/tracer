import { Span, SpanKind, SpanStatus, SpanContext } from '@tracer/core';
import { TracerClient } from './client';
export interface TracerConfig {
    sampleRate?: number;
    alwaysSampleErrors?: boolean;
}
/**
 * ActiveSpan manages a span's lifecycle
 */
export declare class ActiveSpan {
    private span;
    private tracer;
    private ended;
    constructor(span: Span, tracer: Tracer);
    /**
     * Set an attribute on the span
     */
    setAttribute(key: string, value: any): void;
    /**
     * Set multiple attributes on the span
     */
    setAttributes(attributes: Record<string, any>): void;
    /**
     * Add an event to the span
     */
    addEvent(name: string, attributes?: Record<string, any>): void;
    /**
     * Set the span status
     */
    setStatus(status: SpanStatus): void;
    /**
     * End the span
     */
    end(): void;
    /**
     * Get the span context for propagation
     */
    getContext(): SpanContext;
    /**
     * Get trace context headers for HTTP propagation
     */
    getTraceHeaders(): Record<string, string>;
    get spanId(): string;
    get traceId(): string;
    getSpan(): Span;
}
/**
 * Tracer manages distributed tracing
 */
export declare class Tracer {
    private client;
    private activeSpans;
    private spanBuffer;
    private batchSize;
    private flushInterval;
    private flushTimer?;
    private sampleRate;
    private alwaysSampleErrors;
    private readonly maxBufferSize;
    private readonly asyncContext;
    constructor(client: TracerClient, config?: TracerConfig);
    /**
     * Check if a span should be sampled
     */
    private shouldSample;
    /**
     * Start a new span
     */
    startSpan(name: string, kind?: SpanKind, parentContext?: SpanContext): ActiveSpan;
    /**
     * Run a function in the context of a span
     * This ensures getCurrentSpan() works correctly in async contexts
     */
    runInSpan<T>(span: ActiveSpan, fn: () => T | Promise<T>): T | Promise<T>;
    /**
     * End a span (called by ActiveSpan)
     */
    endSpan(activeSpan: ActiveSpan): void;
    /**
     * Get the current active span from async context
     * This works correctly across async boundaries
     */
    getCurrentSpan(): ActiveSpan | undefined;
    /**
     * Flush spans to the API
     */
    flushSpans(): Promise<void>;
    private startAutoFlush;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=tracer.d.ts.map