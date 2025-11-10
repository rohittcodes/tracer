CREATE TYPE "public"."alert_type" AS ENUM('error_spike', 'high_latency', 'service_down', 'threshold_exceeded');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('debug', 'info', 'warn', 'error', 'fatal');--> statement-breakpoint
CREATE TYPE "public"."metric_type" AS ENUM('error_count', 'log_count', 'latency_p95', 'throughput', 'request_count');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"alert_type" "alert_type" NOT NULL,
	"severity" "severity" NOT NULL,
	"message" text NOT NULL,
	"service" varchar(255) NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"tool_router_session_id" varchar(255),
	"alert_sent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key_hash" varchar(255) NOT NULL,
	"name" varchar(255),
	"service" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"level" "log_level" NOT NULL,
	"message" text NOT NULL,
	"service" varchar(255) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"service" varchar(255) NOT NULL,
	"metric_type" "metric_type" NOT NULL,
	"value" double precision NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "alerts_service_resolved_created_idx" ON "alerts" USING btree ("service","resolved","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "alerts_created_at_idx" ON "alerts" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "alerts_resolved_severity_idx" ON "alerts" USING btree ("resolved","severity");--> statement-breakpoint
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_active_idx" ON "api_keys" USING btree ("active");--> statement-breakpoint
CREATE INDEX "api_keys_service_idx" ON "api_keys" USING btree ("service");--> statement-breakpoint
CREATE INDEX "logs_timestamp_idx" ON "logs" USING btree ("timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "logs_service_timestamp_idx" ON "logs" USING btree ("service","timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "logs_level_timestamp_idx" ON "logs" USING btree ("level","timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "logs_metadata_idx" ON "logs" USING btree ("metadata");--> statement-breakpoint
CREATE INDEX "metrics_service_metric_type_window_idx" ON "metrics" USING btree ("service","metric_type","window_start" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "metrics_window_start_idx" ON "metrics" USING btree ("window_start" DESC NULLS LAST);