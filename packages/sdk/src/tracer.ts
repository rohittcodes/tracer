import { Span, SpanKind, SpanStatus, SpanContext, generateTraceId, generateSpanId, injectTraceContext } from '@tracer/core';
import { TracerClient } from './client';
import { AsyncLocalStorage } from 'async_hooks';

export interface TracerConfig {
  sampleRate?: number; // 0.0 to 1.0, default 1.0 (100%)
  alwaysSampleErrors?: boolean; // Always sample traces with errors, default true
}

/**
 * ActiveSpan manages a span's lifecycle
 */
export class ActiveSpan {
  private span: Span;
  private tracer: Tracer;
  private ended: boolean = false;

  constructor(span: Span, tracer: Tracer) {
    this.span = span;
    this.tracer = tracer;
  }

  /**
   * Set an attribute on the span
   */
  setAttribute(key: string, value: any): void {
    if (!this.span.attributes) {
      this.span.attributes = {};
    }
    this.span.attributes[key] = value;
  }

  /**
   * Set multiple attributes on the span
   */
  setAttributes(attributes: Record<string, any>): void {
    if (!this.span.attributes) {
      this.span.attributes = {};
    }
    Object.assign(this.span.attributes, attributes);
  }

  /**
   * Add an event to the span
   */
  addEvent(name: string, attributes?: Record<string, any>): void {
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
  setStatus(status: SpanStatus): void {
    this.span.status = status;
  }

  /**
   * End the span
   */
  end(): void {
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
  getContext(): SpanContext {
    return {
      traceId: this.span.traceId,
      spanId: this.span.spanId,
      parentSpanId: this.span.parentSpanId,
    };
  }

  /**
   * Get trace context headers for HTTP propagation
   */
  getTraceHeaders(): Record<string, string> {
    return injectTraceContext(this.span.traceId, this.span.spanId);
  }

  get spanId(): string {
    return this.span.spanId;
  }

  get traceId(): string {
    return this.span.traceId;
  }

  getSpan(): Span {
    return { ...this.span };
  }
}

/**
 * Tracer manages distributed tracing
 */
export class Tracer {
  private client: TracerClient;
  private activeSpans: Map<string, ActiveSpan> = new Map();
  private spanBuffer: Span[] = [];
  private batchSize: number = 50;
  private flushInterval: number = 5000;
  private flushTimer?: NodeJS.Timeout;
  private sampleRate: number;
  private alwaysSampleErrors: boolean;
  private readonly maxBufferSize: number = 10000; // Prevent unbounded growth
  private readonly asyncContext: AsyncLocalStorage<ActiveSpan> = new AsyncLocalStorage();

  constructor(client: TracerClient, config: TracerConfig = {}) {
    this.client = client;
    this.sampleRate = config.sampleRate ?? 1.0; // Default: 100% sampling
    this.alwaysSampleErrors = config.alwaysSampleErrors ?? true;
    this.startAutoFlush();
  }

  /**
   * Check if a span should be sampled
   */
  private shouldSample(span: Span): boolean {
    // Always sample errors if configured
    if (this.alwaysSampleErrors && span.status === SpanStatus.ERROR) {
      return true;
    }

    // Use sample rate
    return Math.random() < this.sampleRate;
  }

  /**
   * Start a new span
   */
  startSpan(
    name: string,
    kind: SpanKind = SpanKind.INTERNAL,
    parentContext?: SpanContext
  ): ActiveSpan {
    const traceId = parentContext?.traceId || generateTraceId();
    const spanId = generateSpanId();
    const parentSpanId = parentContext?.spanId;

    const span: Span = {
      traceId,
      spanId,
      parentSpanId,
      name,
      kind,
      service: this.client.service,
      startTime: new Date(),
      status: SpanStatus.UNSET,
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
  runInSpan<T>(span: ActiveSpan, fn: () => T | Promise<T>): T | Promise<T> {
    return this.asyncContext.run(span, fn);
  }

  /**
   * End a span (called by ActiveSpan)
   */
  endSpan(activeSpan: ActiveSpan): void {
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
  getCurrentSpan(): ActiveSpan | undefined {
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
  async flushSpans(): Promise<void> {
    if (this.spanBuffer.length === 0) {
      return;
    }

    const spansToSend = [...this.spanBuffer];
    this.spanBuffer = [];

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Access private properties via type assertion (they're needed for API calls)
      const apiKey = (this.client as any).apiKey;
      const apiUrl = (this.client as any).apiUrl;

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
    } catch (error) {
      console.error('Failed to send spans to Tracer API:', error);
      // Re-add spans to buffer for retry, but limit total size
      const availableSpace = this.maxBufferSize - this.spanBuffer.length;
      if (availableSpace > 0) {
        const toReAdd = spansToSend.slice(0, availableSpace);
        this.spanBuffer.unshift(...toReAdd);
        if (spansToSend.length > availableSpace) {
          console.warn(`Dropped ${spansToSend.length - availableSpace} spans due to buffer limit`);
        }
      } else {
        console.warn(`Buffer full, dropping ${spansToSend.length} spans`);
      }
    }
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flushSpans().catch((error) => {
        console.error('Auto-flush spans failed:', error);
      });
    }, this.flushInterval);
  }

  async shutdown(): Promise<void> {
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

