CREATE TYPE "public"."channel_type" AS ENUM('slack', 'email');--> statement-breakpoint
CREATE TABLE "alert_channels" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"channel_type" "channel_type" NOT NULL,
	"name" varchar(255),
	"service" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "logs_metadata_idx";--> statement-breakpoint
ALTER TABLE "logs" DROP CONSTRAINT "logs_pkey";--> statement-breakpoint
ALTER TABLE "metrics" DROP CONSTRAINT "metrics_pkey";--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_id_timestamp_pk" PRIMARY KEY("id","timestamp");--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_id_window_start_pk" PRIMARY KEY("id","window_start");--> statement-breakpoint
CREATE INDEX "alert_channels_channel_type_idx" ON "alert_channels" USING btree ("channel_type");--> statement-breakpoint
CREATE INDEX "alert_channels_active_idx" ON "alert_channels" USING btree ("active");--> statement-breakpoint
CREATE INDEX "alert_channels_service_idx" ON "alert_channels" USING btree ("service");