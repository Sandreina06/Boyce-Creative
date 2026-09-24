ALTER TABLE "changelog_entries" ADD COLUMN "actor_name" text;--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD COLUMN "event_type" text;--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD COLUMN "entity_type" text;--> statement-breakpoint
CREATE UNIQUE INDEX "changelog_meta_ref_unique" ON "changelog_entries" USING btree ("meta_activity_ref");