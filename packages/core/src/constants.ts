// Configuration constants for the observability platform

export const DEFAULT_METRIC_WINDOW_SECONDS = 60;
export const ERROR_COUNT_THRESHOLD = 10;
export const SERVICE_DOWNTIME_MINUTES = 5;
export const LATENCY_THRESHOLD_MS = 1000;
export const LOG_RETENTION_DAYS = 30;
export const BATCH_INSERT_SIZE = 1000;
export const ALERT_RETRY_ATTEMPTS = 3;

// Trace Sampling
export const DEFAULT_TRACE_SAMPLE_RATE = 1.0; // 100% by default (no sampling)
export const TRACE_SAMPLE_RATE_ERROR = 1.0; // Always sample errors

// Alert deduplication configuration
export const ALERT_DEDUP_WINDOW_SECONDS = 5; // 5-second deduplication window
export const ALERT_DEDUP_CLOCK_SKEW_SECONDS = 3; // Handle up to 3s clock skew
export const ALERT_DEDUP_MAX_RETRIES = 3; // Maximum retry attempts
export const ALERT_DEDUP_RETRY_BASE_MS = 50; // Base delay for exponential backoff
