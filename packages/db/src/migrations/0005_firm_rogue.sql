CREATE TABLE "alert_dedupe" (
  "dedupe_key" varchar(512) PRIMARY KEY,
  "alert_id" bigint REFERENCES "public"."alerts"("id") ON DELETE cascade,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "alert_dedupe_expires_at_idx" ON "alert_dedupe" USING btree ("expires_at");
