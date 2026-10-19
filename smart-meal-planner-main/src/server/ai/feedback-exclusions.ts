/**
 * Centralizes exclusion lookups used by generation startup and adds
 * recent meal history lookup to reduce short-horizon recipe repetition.
 */
import { desc, eq, inArray, sql } from "drizzle-orm";
import { days, mealFeedback, meals, plans } from "~/server/db/schema";

type DbType = typeof import("~/server/db").db;

export async function getDislikedRecipes(
  db: DbType,
  userId: string,
): Promise<string[]> {
  console.warn("[verification-step1] getDislikedRecipes invoked", { userId });

  const rows = await db
    .select({
      recipeName: mealFeedback.recipeName,
      averageRating: sql<number>`avg(${mealFeedback.rating})::float`,
    })
    .from(mealFeedback)
    .where(eq(mealFeedback.userId, userId))
    .groupBy(mealFeedback.recipeName);

  return rows
    .filter((row) => row.averageRating < 3)
    .map((row) => row.recipeName);
}

export async function getRecentMealNames(
  db: DbType,
  userId: string,
  limit: number,
): Promise<string[]> {
  if (limit <= 0) {
    return [];
  }

  const recentPlanRows = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.userId, userId))
    .orderBy(desc(plans.createdAt))
    .limit(limit);

  const recentPlanIds = recentPlanRows.map((row) => row.id);
  if (recentPlanIds.length === 0) {
    return [];
  }

  const recentDayRows = await db
    .select({ id: days.id })
    .from(days)
    .where(inArray(days.planId, recentPlanIds));

  const recentDayIds = recentDayRows.map((row) => row.id);
  if (recentDayIds.length === 0) {
    return [];
  }

  const recentMealRows = await db
    .select({ recipeName: meals.recipeName })
    .from(meals)
    .where(inArray(meals.dayId, recentDayIds))
    .limit(limit);

  return Array.from(
    new Set(
      recentMealRows
        .map((row) => row.recipeName.trim())
        .filter((recipeName) => recipeName.length > 0),
    ),
  ).slice(0, limit);
}
