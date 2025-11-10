CREATE TYPE "public"."span_kind" AS ENUM('server', 'client', 'producer', 'consumer', 'internal');--> statement-breakpoint
CREATE TYPE "public"."span_status" AS ENUM('ok', 'error', 'unset');--> statement-breakpoint
CREATE TABLE "spans" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trace_id" varchar(32) NOT NULL,
	"span_id" varchar(16) NOT NULL,
	"parent_span_id" varchar(16),
	"name" varchar(255) NOT NULL,
	"kind" "span_kind" NOT NULL,
	"service" varchar(255) NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"duration" double precision,
	"status" "span_status" NOT NULL,
	"attributes" jsonb,
	"events" jsonb,
	"links" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traces" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trace_id" varchar(32) NOT NULL,
	"service" varchar(255) NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"duration" double precision,
	"span_count" double precision DEFAULT 0 NOT NULL,
	"error_count" double precision DEFAULT 0 NOT NULL,
	"root_span_id" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "traces_trace_id_unique" UNIQUE("trace_id")
);
--> statement-breakpoint
ALTER TABLE "logs" ADD COLUMN "trace_id" varchar(32);--> statement-breakpoint
ALTER TABLE "logs" ADD COLUMN "span_id" varchar(16);--> statement-breakpoint
CREATE INDEX "spans_trace_id_idx" ON "spans" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "spans_span_id_idx" ON "spans" USING btree ("span_id");--> statement-breakpoint
CREATE INDEX "spans_parent_span_id_idx" ON "spans" USING btree ("parent_span_id");--> statement-breakpoint
CREATE INDEX "spans_service_start_time_idx" ON "spans" USING btree ("service","start_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "spans_trace_id_span_id_idx" ON "spans" USING btree ("trace_id","span_id");--> statement-breakpoint
CREATE INDEX "traces_trace_id_idx" ON "traces" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "traces_service_start_time_idx" ON "traces" USING btree ("service","start_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "traces_start_time_idx" ON "traces" USING btree ("start_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "logs_trace_id_idx" ON "logs" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "logs_span_id_idx" ON "logs" USING btree ("span_id");