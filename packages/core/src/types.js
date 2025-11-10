"use strict";
// Core type definitions for the observability platform
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpanStatus = exports.SpanKind = exports.Severity = exports.AlertType = exports.MetricType = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "debug";
    LogLevel["INFO"] = "info";
    LogLevel["WARN"] = "warn";
    LogLevel["ERROR"] = "error";
    LogLevel["FATAL"] = "fatal";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
var MetricType;
(function (MetricType) {
    MetricType["ERROR_COUNT"] = "error_count";
    MetricType["LOG_COUNT"] = "log_count";
    MetricType["LATENCY_P95"] = "latency_p95";
    MetricType["THROUGHPUT"] = "throughput";
    MetricType["REQUEST_COUNT"] = "request_count";
})(MetricType || (exports.MetricType = MetricType = {}));
var AlertType;
(function (AlertType) {
    AlertType["ERROR_SPIKE"] = "error_spike";
    AlertType["HIGH_LATENCY"] = "high_latency";
    AlertType["SERVICE_DOWN"] = "service_down";
    AlertType["THRESHOLD_EXCEEDED"] = "threshold_exceeded";
})(AlertType || (exports.AlertType = AlertType = {}));
var Severity;
(function (Severity) {
    Severity["LOW"] = "low";
    Severity["MEDIUM"] = "medium";
    Severity["HIGH"] = "high";
    Severity["CRITICAL"] = "critical";
})(Severity || (exports.Severity = Severity = {}));
// Distributed Tracing Types
var SpanKind;
(function (SpanKind) {
    SpanKind["SERVER"] = "server";
    SpanKind["CLIENT"] = "client";
    SpanKind["PRODUCER"] = "producer";
    SpanKind["CONSUMER"] = "consumer";
    SpanKind["INTERNAL"] = "internal";
})(SpanKind || (exports.SpanKind = SpanKind = {}));
var SpanStatus;
(function (SpanStatus) {
    SpanStatus["OK"] = "ok";
    SpanStatus["ERROR"] = "error";
    SpanStatus["UNSET"] = "unset";
})(SpanStatus || (exports.SpanStatus = SpanStatus = {}));
//# sourceMappingURL=types.js.map