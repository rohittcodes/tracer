"use strict";
// Configuration constants for the observability platform
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRACE_SAMPLE_RATE_ERROR = exports.DEFAULT_TRACE_SAMPLE_RATE = exports.ALERT_RETRY_ATTEMPTS = exports.BATCH_INSERT_SIZE = exports.LOG_RETENTION_DAYS = exports.LATENCY_THRESHOLD_MS = exports.SERVICE_DOWNTIME_MINUTES = exports.ERROR_COUNT_THRESHOLD = exports.DEFAULT_METRIC_WINDOW_SECONDS = void 0;
exports.DEFAULT_METRIC_WINDOW_SECONDS = 60;
exports.ERROR_COUNT_THRESHOLD = 10;
exports.SERVICE_DOWNTIME_MINUTES = 5;
exports.LATENCY_THRESHOLD_MS = 1000;
exports.LOG_RETENTION_DAYS = 30;
exports.BATCH_INSERT_SIZE = 1000;
exports.ALERT_RETRY_ATTEMPTS = 3;
// Trace Sampling
exports.DEFAULT_TRACE_SAMPLE_RATE = 1.0; // 100% by default (no sampling)
exports.TRACE_SAMPLE_RATE_ERROR = 1.0; // Always sample errors
//# sourceMappingURL=constants.js.map