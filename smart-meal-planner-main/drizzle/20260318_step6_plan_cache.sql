-- Step 6: Add profile-hash plan cache table for 6-hour generation reuse.
CREATE TABLE "smart_meal_plan_cache" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "profile_hash" text NOT NULL,
  "plan_json" json NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "smart_meal_plan_cache"
ADD CONSTRAINT "smart_meal_plan_cache_user_id_smart_meal_user_id_fk"
FOREIGN KEY ("user_id") REFERENCES "public"."smart_meal_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "plan_cache_profile_hash_created_at_idx"
ON "smart_meal_plan_cache" ("profile_hash", "created_at");
