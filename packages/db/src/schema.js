"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alertChannels = exports.spans = exports.traces = exports.spanStatusEnum = exports.spanKindEnum = exports.channelTypeEnum = exports.apiKeys = exports.alerts = exports.metrics = exports.logs = exports.severityEnum = exports.alertTypeEnum = exports.metricTypeEnum = exports.logLevelEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.logLevelEnum = (0, pg_core_1.pgEnum)('log_level', ['debug', 'info', 'warn', 'error', 'fatal']);
exports.metricTypeEnum = (0, pg_core_1.pgEnum)('metric_type', ['error_count', 'log_count', 'latency_p95', 'throughput', 'request_count']);
exports.alertTypeEnum = (0, pg_core_1.pgEnum)('alert_type', ['error_spike', 'high_latency', 'service_down', 'threshold_exceeded']);
exports.severityEnum = (0, pg_core_1.pgEnum)('severity', ['low', 'medium', 'high', 'critical']);
exports.logs = (0, pg_core_1.pgTable)('logs', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).notNull(),
    timestamp: (0, pg_core_1.timestamp)('timestamp', { withTimezone: true }).notNull(),
    level: (0, exports.logLevelEnum)('level').notNull(),
    message: (0, pg_core_1.text)('message').notNull(),
    service: (0, pg_core_1.varchar)('service', { length: 255 }).notNull(),
    metadata: (0, pg_core_1.jsonb)('metadata'),
    traceId: (0, pg_core_1.varchar)('trace_id', { length: 32 }), // 32 hex chars for trace ID
    spanId: (0, pg_core_1.varchar)('span_id', { length: 16 }), // 16 hex chars for span ID
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    pk: (0, pg_core_1.primaryKey)({ columns: [table.id, table.timestamp] }),
    timestampIdx: (0, pg_core_1.index)('logs_timestamp_idx').on(table.timestamp.desc()),
    serviceTimestampIdx: (0, pg_core_1.index)('logs_service_timestamp_idx').on(table.service, table.timestamp.desc()),
    levelTimestampIdx: (0, pg_core_1.index)('logs_level_timestamp_idx').on(table.level, table.timestamp.desc()),
    traceIdIdx: (0, pg_core_1.index)('logs_trace_id_idx').on(table.traceId),
    spanIdIdx: (0, pg_core_1.index)('logs_span_id_idx').on(table.spanId),
}));
exports.metrics = (0, pg_core_1.pgTable)('metrics', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).notNull(),
    service: (0, pg_core_1.varchar)('service', { length: 255 }).notNull(),
    metricType: (0, exports.metricTypeEnum)('metric_type').notNull(),
    value: (0, pg_core_1.doublePrecision)('value').notNull(),
    windowStart: (0, pg_core_1.timestamp)('window_start', { withTimezone: true }).notNull(),
    windowEnd: (0, pg_core_1.timestamp)('window_end', { withTimezone: true }).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    pk: (0, pg_core_1.primaryKey)({ columns: [table.id, table.windowStart] }),
    serviceMetricTypeWindowIdx: (0, pg_core_1.index)('metrics_service_metric_type_window_idx').on(table.service, table.metricType, table.windowStart.desc()),
    windowStartIdx: (0, pg_core_1.index)('metrics_window_start_idx').on(table.windowStart.desc()),
}));
exports.alerts = (0, pg_core_1.pgTable)('alerts', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    alertType: (0, exports.alertTypeEnum)('alert_type').notNull(),
    severity: (0, exports.severityEnum)('severity').notNull(),
    message: (0, pg_core_1.text)('message').notNull(),
    service: (0, pg_core_1.varchar)('service', { length: 255 }).notNull(),
    resolved: (0, pg_core_1.boolean)('resolved').notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at', { withTimezone: true }),
    toolRouterSessionId: (0, pg_core_1.varchar)('tool_router_session_id', { length: 255 }),
    alertSent: (0, pg_core_1.boolean)('alert_sent').notNull().default(false),
}, (table) => ({
    serviceResolvedCreatedIdx: (0, pg_core_1.index)('alerts_service_resolved_created_idx').on(table.service, table.resolved, table.createdAt.desc()),
    createdAtIdx: (0, pg_core_1.index)('alerts_created_at_idx').on(table.createdAt.desc()),
    resolvedSeverityIdx: (0, pg_core_1.index)('alerts_resolved_severity_idx').on(table.resolved, table.severity),
}));
exports.apiKeys = (0, pg_core_1.pgTable)('api_keys', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    keyHash: (0, pg_core_1.varchar)('key_hash', { length: 255 }).notNull().unique(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }),
    service: (0, pg_core_1.varchar)('service', { length: 255 }),
    active: (0, pg_core_1.boolean)('active').notNull().default(true),
    lastUsedAt: (0, pg_core_1.timestamp)('last_used_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }),
}, (table) => ({
    keyHashIdx: (0, pg_core_1.index)('api_keys_key_hash_idx').on(table.keyHash),
    activeIdx: (0, pg_core_1.index)('api_keys_active_idx').on(table.active),
    serviceIdx: (0, pg_core_1.index)('api_keys_service_idx').on(table.service),
}));
exports.channelTypeEnum = (0, pg_core_1.pgEnum)('channel_type', ['slack', 'email']);
exports.spanKindEnum = (0, pg_core_1.pgEnum)('span_kind', ['server', 'client', 'producer', 'consumer', 'internal']);
exports.spanStatusEnum = (0, pg_core_1.pgEnum)('span_status', ['ok', 'error', 'unset']);
// Traces table - stores trace metadata
exports.traces = (0, pg_core_1.pgTable)('traces', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    traceId: (0, pg_core_1.varchar)('trace_id', { length: 32 }).notNull().unique(), // 32 hex chars
    service: (0, pg_core_1.varchar)('service', { length: 255 }).notNull(),
    startTime: (0, pg_core_1.timestamp)('start_time', { withTimezone: true }).notNull(),
    endTime: (0, pg_core_1.timestamp)('end_time', { withTimezone: true }),
    duration: (0, pg_core_1.doublePrecision)('duration'), // in milliseconds
    spanCount: (0, pg_core_1.doublePrecision)('span_count').notNull().default(0),
    errorCount: (0, pg_core_1.doublePrecision)('error_count').notNull().default(0),
    rootSpanId: (0, pg_core_1.varchar)('root_span_id', { length: 16 }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    traceIdIdx: (0, pg_core_1.index)('traces_trace_id_idx').on(table.traceId),
    serviceStartTimeIdx: (0, pg_core_1.index)('traces_service_start_time_idx').on(table.service, table.startTime.desc()),
    startTimeIdx: (0, pg_core_1.index)('traces_start_time_idx').on(table.startTime.desc()),
}));
// Spans table - stores individual spans
exports.spans = (0, pg_core_1.pgTable)('spans', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    traceId: (0, pg_core_1.varchar)('trace_id', { length: 32 }).notNull(),
    spanId: (0, pg_core_1.varchar)('span_id', { length: 16 }).notNull(),
    parentSpanId: (0, pg_core_1.varchar)('parent_span_id', { length: 16 }),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    kind: (0, exports.spanKindEnum)('kind').notNull(),
    service: (0, pg_core_1.varchar)('service', { length: 255 }).notNull(),
    startTime: (0, pg_core_1.timestamp)('start_time', { withTimezone: true }).notNull(),
    endTime: (0, pg_core_1.timestamp)('end_time', { withTimezone: true }),
    duration: (0, pg_core_1.doublePrecision)('duration'), // in milliseconds
    status: (0, exports.spanStatusEnum)('status').notNull(),
    attributes: (0, pg_core_1.jsonb)('attributes'),
    events: (0, pg_core_1.jsonb)('events'),
    links: (0, pg_core_1.jsonb)('links'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    traceIdIdx: (0, pg_core_1.index)('spans_trace_id_idx').on(table.traceId),
    spanIdIdx: (0, pg_core_1.index)('spans_span_id_idx').on(table.spanId),
    parentSpanIdIdx: (0, pg_core_1.index)('spans_parent_span_id_idx').on(table.parentSpanId),
    serviceStartTimeIdx: (0, pg_core_1.index)('spans_service_start_time_idx').on(table.service, table.startTime.desc()),
    traceIdSpanIdIdx: (0, pg_core_1.index)('spans_trace_id_span_id_idx').on(table.traceId, table.spanId),
}));
exports.alertChannels = (0, pg_core_1.pgTable)('alert_channels', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    channelType: (0, exports.channelTypeEnum)('channel_type').notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }),
    service: (0, pg_core_1.varchar)('service', { length: 255 }),
    active: (0, pg_core_1.boolean)('active').notNull().default(true),
    config: (0, pg_core_1.jsonb)('config').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
    channelTypeIdx: (0, pg_core_1.index)('alert_channels_channel_type_idx').on(table.channelType),
    activeIdx: (0, pg_core_1.index)('alert_channels_active_idx').on(table.active),
    serviceIdx: (0, pg_core_1.index)('alert_channels_service_idx').on(table.service),
}));
//# sourceMappingURL=schema.js.map