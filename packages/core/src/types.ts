// Core type definitions for the observability platform

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export enum MetricType {
  ERROR_COUNT = 'error_count',
  LOG_COUNT = 'log_count',
  LATENCY_P95 = 'latency_p95',
  THROUGHPUT = 'throughput',
  REQUEST_COUNT = 'request_count',
}

export interface Metric {
  service: string;
  metricType: MetricType;
  value: number;
  windowStart: Date;
  windowEnd: Date;
}

export enum AlertType {
  ERROR_SPIKE = 'error_spike',
  HIGH_LATENCY = 'high_latency',
  SERVICE_DOWN = 'service_down',
  THRESHOLD_EXCEEDED = 'threshold_exceeded',
}

export enum Severity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface Alert {
  alertType: AlertType;
  severity: Severity;
  message: string;
  service: string;
  projectId?: number; // Optional - can be resolved from service
  resolved: boolean;
  createdAt: Date;
  resolvedAt?: Date;
}

// Distributed Tracing Types

export enum SpanKind {
  SERVER = 'server',
  CLIENT = 'client',
  PRODUCER = 'producer',
  CONSUMER = 'consumer',
  INTERNAL = 'internal',
}

export enum SpanStatus {
  OK = 'ok',
  ERROR = 'error',
  UNSET = 'unset',
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  service: string;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in milliseconds
  status: SpanStatus;
  attributes?: Record<string, any>;
  events?: SpanEvent[];
  links?: SpanLink[];
}

export interface SpanEvent {
  name: string;
  timestamp: Date;
  attributes?: Record<string, any>;
}

export interface SpanLink {
  traceId: string;
  spanId: string;
  attributes?: Record<string, any>;
}

export interface Trace {
  traceId: string;
  service: string;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in milliseconds
  spanCount: number;
  errorCount: number;
  rootSpanId?: string;
  spans: Span[];
}

// Span context for propagation
export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

// LogEntry with trace context support
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  service: string;
  metadata?: Record<string, any>;
  traceId?: string; // Link log to trace
  spanId?: string; // Link log to specific span
}

