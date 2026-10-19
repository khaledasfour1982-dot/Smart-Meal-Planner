ALTER TABLE "smart_meal_day" ADD COLUMN "status" varchar(20) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "smart_meal_day" ADD COLUMN "failure_reason" varchar(100);--> statement-breakpoint
ALTER TABLE "smart_meal_plan" ADD COLUMN "generation_status" varchar(20) DEFAULT 'idle' NOT NULL;