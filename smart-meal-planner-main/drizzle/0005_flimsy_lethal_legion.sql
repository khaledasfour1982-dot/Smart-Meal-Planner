ALTER TABLE "smart_meal_profile"
ADD COLUMN IF NOT EXISTS "weekly_budget_euro" integer DEFAULT 0;

UPDATE "smart_meal_profile"
SET "weekly_budget_euro" = 0
WHERE "weekly_budget_euro" IS NULL;

ALTER TABLE "smart_meal_profile"
ALTER COLUMN "weekly_budget_euro" SET DEFAULT 0;

ALTER TABLE "smart_meal_profile"
ALTER COLUMN "weekly_budget_euro" SET NOT NULL;