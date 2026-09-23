CREATE TYPE "public"."business_type" AS ENUM('lead_gen', 'ecommerce', 'appointment', 'custom');--> statement-breakpoint
CREATE TYPE "public"."changelog_category" AS ENUM('budget', 'bid_strategy', 'budget_allocation', 'campaign_structure', 'audience', 'targeting', 'placement', 'creative', 'copy', 'optimization_event', 'tracking', 'conversion', 'campaign_status', 'ad_set_status', 'ad_status', 'other');--> statement-breakpoint
CREATE TYPE "public"."changelog_source" AS ENUM('manual', 'meta_activity');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('account', 'campaign', 'adset', 'ad', 'creative');--> statement-breakpoint
CREATE TYPE "public"."insight_severity" AS ENUM('info', 'opportunity', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."insight_status" AS ENUM('new', 'reviewed', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."kpi_direction" AS ENUM('lower_better', 'higher_better');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'manager', 'viewer');--> statement-breakpoint
CREATE TABLE "agency_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"agency_name" text DEFAULT 'Boyce Creative' NOT NULL,
	"business_portfolio_id" text,
	"pacing_thresholds" jsonb DEFAULT '{"onTrackPct":10,"criticalPct":25}'::jsonb NOT NULL,
	"attention_thresholds" jsonb DEFAULT '{"kpiChangeWarnPct":20,"kpiChangeCriticalPct":35,"ctrDropWarnPct":20,"minSpend":50}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"date" date NOT NULL,
	"label" text NOT NULL,
	"note" text,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "changelog_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"meta_account_id" text,
	"campaign_id" text,
	"campaign_name" text,
	"adset_id" text,
	"adset_name" text,
	"ad_id" text,
	"ad_name" text,
	"changed_at" timestamp with time zone NOT NULL,
	"author_id" uuid,
	"category" "changelog_category" NOT NULL,
	"action" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"reason" text,
	"hypothesis" text,
	"expected_impact" text,
	"review_date" date,
	"notes" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"source" "changelog_source" DEFAULT 'manual' NOT NULL,
	"meta_activity_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"month" date NOT NULL,
	"amount" double precision NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_settings" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"business_type" "business_type" DEFAULT 'lead_gen' NOT NULL,
	"primary_conversion_field" text DEFAULT 'actions_lead' NOT NULL,
	"primary_conversion_label" text DEFAULT 'Leads' NOT NULL,
	"primary_value_field" text,
	"primary_kpi" text DEFAULT 'CPL' NOT NULL,
	"secondary_kpis" text[] DEFAULT '{"CTR","CPC","CPM","CVR"}' NOT NULL,
	"attribution_window" text DEFAULT 'default' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"target_value" double precision NOT NULL,
	"direction" "kpi_direction" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "insight_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insight_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"entity_name" text NOT NULL,
	"metric" text NOT NULL,
	"range_start" date NOT NULL,
	"range_end" date NOT NULL,
	"compare_start" date,
	"compare_end" date,
	"current_value" double precision,
	"previous_value" double precision,
	"change_pct" double precision,
	"severity" "insight_severity" NOT NULL,
	"status" "insight_status" DEFAULT 'new' NOT NULL,
	"rule_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"fingerprint" text NOT NULL,
	"ai_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_account_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"windsor_connector" text DEFAULT 'facebook' NOT NULL,
	"meta_account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"currency" text,
	"timezone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_hash" text NOT NULL,
	"source" text NOT NULL,
	"query" jsonb NOT NULL,
	"rows" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_client_access" (
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_client_access_user_id_client_id_pk" PRIMARY KEY("user_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'manager' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD CONSTRAINT "changelog_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD CONSTRAINT "changelog_entries_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_budgets" ADD CONSTRAINT "client_budgets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_settings" ADD CONSTRAINT "client_settings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_targets" ADD CONSTRAINT "client_targets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_evidence" ADD CONSTRAINT "insight_evidence_insight_id_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."insights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_account_mappings" ADD CONSTRAINT "meta_account_mappings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_client_access" ADD CONSTRAINT "user_client_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_client_access" ADD CONSTRAINT "user_client_access_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotations_client_date_idx" ON "annotations" USING btree ("client_id","date");--> statement-breakpoint
CREATE INDEX "changelog_client_time_idx" ON "changelog_entries" USING btree ("client_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "client_budget_month_unique" ON "client_budgets" USING btree ("client_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "client_target_metric_unique" ON "client_targets" USING btree ("client_id","metric");--> statement-breakpoint
CREATE UNIQUE INDEX "insight_fingerprint_unique" ON "insights" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "insights_client_idx" ON "insights" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_account_unique" ON "meta_account_mappings" USING btree ("windsor_connector","meta_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_query_unique" ON "performance_snapshots" USING btree ("query_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");