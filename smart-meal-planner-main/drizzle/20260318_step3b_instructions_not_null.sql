UPDATE "smart_meal_meal"
SET "instructions" = 'Open this recipe to view full cooking instructions.'
WHERE "instructions" IS NULL;--> statement-breakpoint
ALTER TABLE "smart_meal_meal" ALTER COLUMN "instructions" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "smart_meal_meal" ALTER COLUMN "instructions" SET DEFAULT 'Open this recipe to view full cooking instructions.';