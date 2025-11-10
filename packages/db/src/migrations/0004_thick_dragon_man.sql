ALTER TABLE "alerts" ADD COLUMN "project_id" bigint;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_project_id_idx" ON "alerts" USING btree ("project_id");