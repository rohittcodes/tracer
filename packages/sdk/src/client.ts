import { LogEntry, LogLevel } from '@tracer/core';
import { Tracer, ActiveSpan, TracerConfig } from './tracer';

export interface TracerClientConfig {
  apiUrl?: string;
  apiKey?: string;
  service: string;
  batchSize?: number;
  flushInterval?: number;
  traceSampleRate?: number; // 0.0 to 1.0, default 1.0
  alwaysSampleErrors?: boolean; // Default true
}

export class TracerClient {
  private apiUrl: string;
  private apiKey?: string;
  public readonly service: string;
  private batchSize: number;
  private flushInterval: number;
  private buffer: LogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;
  public readonly tracer: Tracer;
  private readonly maxBufferSize: number = 10000; // Prevent unbounded growth

  constructor(config: TracerClientConfig) {
    this.apiUrl = config.apiUrl || process.env.TRACER_API_URL || 'http://localhost:3000';
    this.apiKey = config.apiKey || process.env.TRACER_API_KEY;
    this.service = config.service;
    this.batchSize = config.batchSize || 10;
    this.flushInterval = config.flushInterval || 5000;

    const tracerConfig: TracerConfig = {
      sampleRate: config.traceSampleRate,
      alwaysSampleErrors: config.alwaysSampleErrors,
    };
    this.tracer = new Tracer(this, tracerConfig);
    this.startAutoFlush();
  }

  log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    const currentSpan = this.tracer.getCurrentSpan();
    const traceId = currentSpan?.traceId;
    const spanId = currentSpan?.spanId;

    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      service: this.service,
      metadata,
      traceId,
      spanId,
    };

    // Prevent unbounded buffer growth
    if (this.buffer.length >= this.maxBufferSize) {
      console.warn(`Log buffer full (${this.maxBufferSize}), dropping oldest logs`);
      const toRemove = this.buffer.length - this.maxBufferSize + 1;
      this.buffer.splice(0, toRemove);
    }

    this.buffer.push(logEntry);

    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  error(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, metadata);
  }

  fatal(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.FATAL, message, metadata);
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const logsToSend = [...this.buffer];
    this.buffer = [];

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.apiUrl}/logs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ logs: logsToSend }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send logs: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send logs to Tracer API:', error);
      // Re-add logs to buffer for retry, but limit total size
      const availableSpace = this.maxBufferSize - this.buffer.length;
      if (availableSpace > 0) {
        const toReAdd = logsToSend.slice(0, availableSpace);
        this.buffer.unshift(...toReAdd);
        if (logsToSend.length > availableSpace) {
          console.warn(`Dropped ${logsToSend.length - availableSpace} logs due to buffer limit`);
        }
      } else {
        console.warn(`Buffer full, dropping ${logsToSend.length} logs`);
      }
      throw error;
    }
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => {
        console.error('Auto-flush failed:', error);
      });
    }, this.flushInterval);
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    await this.flush();
    await this.tracer.shutdown();
  }
}

