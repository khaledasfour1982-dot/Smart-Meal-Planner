ALTER TABLE "smart_meal_plan"
ADD COLUMN IF NOT EXISTS "start_date" timestamp;

UPDATE "smart_meal_plan"
SET "start_date" = COALESCE("created_at", CURRENT_TIMESTAMP)
WHERE "start_date" IS NULL;

ALTER TABLE "smart_meal_plan"
ALTER COLUMN "start_date" SET NOT NULL;
