CREATE TYPE "public"."lead_method" AS ENUM('instant_form', 'website', 'mixed', 'traffic', 'other');--> statement-breakpoint
ALTER TABLE "client_settings" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "client_settings" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "client_settings" ADD COLUMN "lead_method" "lead_method";--> statement-breakpoint
ALTER TABLE "client_settings" ADD COLUMN "service_area" text;--> statement-breakpoint
ALTER TABLE "client_settings" ADD COLUMN "context_notes" text;