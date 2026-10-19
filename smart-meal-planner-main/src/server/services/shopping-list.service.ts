import { eq } from "drizzle-orm";
import {
  mergeIngredients,
  type MergeableIngredient,
  type MergedIngredient,
} from "~/server/ai/unit-normalizer";
import { days, meals, plans } from "~/server/db/schema";

type DatabaseClient = typeof import("~/server/db").db;

export type ShoppingScope = "meal" | "day" | "plan";

function parseIngredients(rawValue: unknown): MergeableIngredient[] {
  let parsedValue: unknown = rawValue;

  if (typeof rawValue === "string") {
    try {
      parsedValue = JSON.parse(rawValue) as unknown;
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  const ingredients: MergeableIngredient[] = [];

  for (const ingredient of parsedValue) {
    if (!ingredient || typeof ingredient !== "object") {
      continue;
    }

    const record = ingredient as Record<string, unknown>;
    if (typeof record.name !== "string" || typeof record.unit !== "string") {
      continue;
    }

    const quantity = record.quantity;
    if (typeof quantity !== "number" && typeof quantity !== "string") {
      continue;
    }

    ingredients.push({
      name: record.name,
      quantity,
      unit: record.unit,
      category:
        typeof record.category === "string" ? record.category : undefined,
    });
  }

  return ingredients;
}

export async function aggregateIngredients(
  scope: ShoppingScope,
  scopeId: string,
  db: DatabaseClient,
  dayIds?: string[],
): Promise<MergedIngredient[]> {
  const ingredientRows: MergeableIngredient[] = [];

  if (scope === "meal") {
    const meal = await db.query.meals.findFirst({
      where: eq(meals.id, scopeId),
    });

    if (!meal) {
      return [];
    }

    ingredientRows.push(...parseIngredients(meal.ingredients));
    return mergeIngredients(ingredientRows);
  }

  if (scope === "day") {
    const day = await db.query.days.findFirst({
      where: eq(days.id, scopeId),
      with: {
        meals: true,
      },
    });

    if (!day) {
      return [];
    }

    for (const dayMeal of day.meals) {
      ingredientRows.push(...parseIngredients(dayMeal.ingredients));
    }

    return mergeIngredients(ingredientRows);
  }

  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, scopeId),
    with: {
      days: {
        with: {
          meals: true,
        },
      },
    },
  });

  if (!plan) {
    return [];
  }

  const planDays =
    dayIds && dayIds.length > 0
      ? plan.days.filter((day) => dayIds.includes(day.id))
      : plan.days;

  for (const day of planDays) {
    for (const dayMeal of day.meals) {
      ingredientRows.push(...parseIngredients(dayMeal.ingredients));
    }
  }

  return mergeIngredients(ingredientRows);
}
