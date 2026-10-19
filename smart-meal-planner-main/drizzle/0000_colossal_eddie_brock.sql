CREATE TYPE "public"."meal_type" AS ENUM('breakfast', 'lunch', 'dinner');--> statement-breakpoint
CREATE TABLE "smart_meal_day" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"day_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_meal_meal" (
	"id" text PRIMARY KEY NOT NULL,
	"day_id" text NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"recipe_name" text NOT NULL,
	"ingredients" json NOT NULL,
	"instructions" text NOT NULL,
	"cook_time_minutes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_meal_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_days" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_meal_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"adults" integer DEFAULT 1 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"toddlers" integer DEFAULT 0 NOT NULL,
	"diet_types" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"allergens" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"dislikes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"portion_multipliers" json,
	"updated_at" timestamp,
	CONSTRAINT "smart_meal_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "smart_meal_shopping_list_item" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"ingredient_name" text NOT NULL,
	"quantity" numeric NOT NULL,
	"unit" text NOT NULL,
	"category" text DEFAULT 'Other' NOT NULL,
	"is_checked" boolean DEFAULT false NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_meal_user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"consent_timestamp" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "smart_meal_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "smart_meal_day" ADD CONSTRAINT "smart_meal_day_plan_id_smart_meal_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."smart_meal_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_meal_meal" ADD CONSTRAINT "smart_meal_meal_day_id_smart_meal_day_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."smart_meal_day"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_meal_plan" ADD CONSTRAINT "smart_meal_plan_user_id_smart_meal_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."smart_meal_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_meal_profile" ADD CONSTRAINT "smart_meal_profile_user_id_smart_meal_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."smart_meal_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_meal_shopping_list_item" ADD CONSTRAINT "smart_meal_shopping_list_item_plan_id_smart_meal_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."smart_meal_plan"("id") ON DELETE cascade ON UPDATE no action;