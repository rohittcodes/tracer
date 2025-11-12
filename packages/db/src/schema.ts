import { pgTable, bigserial, bigint, varchar, text, doublePrecision, timestamp, boolean, jsonb, pgEnum, index, primaryKey } from 'drizzle-orm/pg-core';
import { LogLevel, MetricType, AlertType, Severity, SpanKind, SpanStatus } from '@tracer/core';

export const logLevelEnum = pgEnum('log_level', ['debug', 'info', 'warn', 'error', 'fatal']);
export const metricTypeEnum = pgEnum('metric_type', ['error_count', 'log_count', 'latency_p95', 'throughput', 'request_count']);
export const alertTypeEnum = pgEnum('alert_type', ['error_spike', 'high_latency', 'service_down', 'threshold_exceeded']);
export const severityEnum = pgEnum('severity', ['low', 'medium', 'high', 'critical']);

export const logs = pgTable('logs', {
  id: bigserial('id', { mode: 'number' }).notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  level: logLevelEnum('level').notNull(),
  message: text('message').notNull(),
  service: varchar('service', { length: 255 }).notNull(),
  metadata: jsonb('metadata'),
  traceId: varchar('trace_id', { length: 32 }), // 32 hex chars for trace ID
  spanId: varchar('span_id', { length: 16 }), // 16 hex chars for span ID
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.id, table.timestamp] }),
  timestampIdx: index('logs_timestamp_idx').on(table.timestamp.desc()),
  serviceTimestampIdx: index('logs_service_timestamp_idx').on(table.service, table.timestamp.desc()),
  levelTimestampIdx: index('logs_level_timestamp_idx').on(table.level, table.timestamp.desc()),
  traceIdIdx: index('logs_trace_id_idx').on(table.traceId),
  spanIdIdx: index('logs_span_id_idx').on(table.spanId),
}));

export const metrics = pgTable('metrics', {
  id: bigserial('id', { mode: 'number' }).notNull(),
  service: varchar('service', { length: 255 }).notNull(),
  metricType: metricTypeEnum('metric_type').notNull(),
  value: doublePrecision('value').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.id, table.windowStart] }),
  serviceMetricTypeWindowIdx: index('metrics_service_metric_type_window_idx').on(table.service, table.metricType, table.windowStart.desc()),
  windowStartIdx: index('metrics_window_start_idx').on(table.windowStart.desc()),
}));

export const alerts = pgTable('alerts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  projectId: bigint('project_id', { mode: 'number' }).references(() => projects.id, { onDelete: 'cascade' }),
  alertType: alertTypeEnum('alert_type').notNull(),
  severity: severityEnum('severity').notNull(),
  message: text('message').notNull(),
  service: varchar('service', { length: 255 }).notNull(),
  resolved: boolean('resolved').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  toolRouterSessionId: varchar('tool_router_session_id', { length: 255 }),
  alertSent: boolean('alert_sent').notNull().default(false),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }), // For rate limiting
}, (table) => ({
  serviceResolvedCreatedIdx: index('alerts_service_resolved_created_idx').on(table.service, table.resolved, table.createdAt.desc()),
  createdAtIdx: index('alerts_created_at_idx').on(table.createdAt.desc()),
  resolvedSeverityIdx: index('alerts_resolved_severity_idx').on(table.resolved, table.severity),
  projectIdIdx: index('alerts_project_id_idx').on(table.projectId),
}));

export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
}));

export const projects = pgTable('projects', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  userIdIdx: index('projects_user_id_idx').on(table.userId),
  nameIdx: index('projects_name_idx').on(table.name),
}));

export const apiKeys = pgTable('api_keys', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  projectId: bigint('project_id', { mode: 'number' }).notNull().references(() => projects.id, { onDelete: 'cascade' }),
  keyHash: varchar('key_hash', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  service: varchar('service', { length: 255 }),
  active: boolean('active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => ({
  keyHashIdx: index('api_keys_key_hash_idx').on(table.keyHash),
  activeIdx: index('api_keys_active_idx').on(table.active),
  serviceIdx: index('api_keys_service_idx').on(table.service),
  projectIdIdx: index('api_keys_project_id_idx').on(table.projectId),
}));

export const channelTypeEnum = pgEnum('channel_type', ['slack', 'email']);
export const spanKindEnum = pgEnum('span_kind', ['server', 'client', 'producer', 'consumer', 'internal']);
export const spanStatusEnum = pgEnum('span_status', ['ok', 'error', 'unset']);

// Traces table - stores trace metadata
export const traces = pgTable('traces', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  traceId: varchar('trace_id', { length: 32 }).notNull().unique(), // 32 hex chars
  service: varchar('service', { length: 255 }).notNull(),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }),
  duration: doublePrecision('duration'), // in milliseconds
  spanCount: doublePrecision('span_count').notNull().default(0),
  errorCount: doublePrecision('error_count').notNull().default(0),
  rootSpanId: varchar('root_span_id', { length: 16 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  traceIdIdx: index('traces_trace_id_idx').on(table.traceId),
  serviceStartTimeIdx: index('traces_service_start_time_idx').on(table.service, table.startTime.desc()),
  startTimeIdx: index('traces_start_time_idx').on(table.startTime.desc()),
}));

// Spans table - stores individual spans
export const spans = pgTable('spans', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  traceId: varchar('trace_id', { length: 32 }).notNull(),
  spanId: varchar('span_id', { length: 16 }).notNull(),
  parentSpanId: varchar('parent_span_id', { length: 16 }),
  name: varchar('name', { length: 255 }).notNull(),
  kind: spanKindEnum('kind').notNull(),
  service: varchar('service', { length: 255 }).notNull(),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }),
  duration: doublePrecision('duration'), // in milliseconds
  status: spanStatusEnum('status').notNull(),
  attributes: jsonb('attributes'),
  events: jsonb('events'),
  links: jsonb('links'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  traceIdIdx: index('spans_trace_id_idx').on(table.traceId),
  spanIdIdx: index('spans_span_id_idx').on(table.spanId),
  parentSpanIdIdx: index('spans_parent_span_id_idx').on(table.parentSpanId),
  serviceStartTimeIdx: index('spans_service_start_time_idx').on(table.service, table.startTime.desc()),
  traceIdSpanIdIdx: index('spans_trace_id_span_id_idx').on(table.traceId, table.spanId),
}));

export const alertChannels = pgTable('alert_channels', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  projectId: bigint('project_id', { mode: 'number' }).notNull().references(() => projects.id, { onDelete: 'cascade' }),
  channelType: channelTypeEnum('channel_type').notNull(),
  name: varchar('name', { length: 255 }),
  service: varchar('service', { length: 255 }),
  active: boolean('active').notNull().default(true),
  config: jsonb('config').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  channelTypeIdx: index('alert_channels_channel_type_idx').on(table.channelType),
  activeIdx: index('alert_channels_active_idx').on(table.active),
  serviceIdx: index('alert_channels_service_idx').on(table.service),
  projectIdIdx: index('alert_channels_project_id_idx').on(table.projectId),
}));

export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type AlertChannel = typeof alertChannels.$inferSelect;
export type NewAlertChannel = typeof alertChannels.$inferInsert;
export type Trace = typeof traces.$inferSelect;
export type NewTrace = typeof traces.$inferInsert;
export type Span = typeof spans.$inferSelect;
export type NewSpan = typeof spans.$inferInsert;

