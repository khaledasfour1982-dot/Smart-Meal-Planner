import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, or } from "drizzle-orm";
import { z } from "zod";
import { buildMealHash } from "~/server/ai/meal-hash";
import {
  getDislikedRecipes,
  getRecentMealNames,
} from "~/server/ai/feedback-exclusions";
import type { DayMealSelection } from "~/server/ai/meal-plan-prompt";
import type { GenerationContext } from "~/server/ai/types";
import { days, meals, planCache, plans, profiles } from "~/server/db/schema";
import { runGenerationOrchestrator } from "~/server/services/generation-orchestrator.service";

const PortionMultipliersSchema = z.object({
  adult: z.number().positive(),
  child: z.number().positive(),
  toddler: z.number().positive(),
});

export const PlanGenerateInputSchema = z.object({
  days: z.number().min(1).max(7),
  mealsPerDay: z.enum(["1", "2", "3"]),
});

export type PlanGenerateInput = z.infer<typeof PlanGenerateInputSchema>;

export interface PlanGenerateResponse {
  planId: string;
  requestedDays: number;
  streamUrl: string;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const CachedMealSchema = z.object({
  mealType: z.enum(["breakfast", "lunch", "dinner"]),
  recipeName: z.string(),
  imageUrl: z.string().nullable().optional(),
  ingredients: z.unknown(),
  shortSummary: z.string(),
  instructions: z.string().nullable().optional(),
  cookTimeMinutes: z.number().int().positive(),
});

const CachedPlanPayloadSchema = z.object({
  days: z.array(
    z.object({
      dayNumber: z.number().int().min(1).max(7),
      meals: z.array(CachedMealSchema),
    }),
  ),
});

type CachedPlanPayload = z.infer<typeof CachedPlanPayloadSchema>;

function parseIngredientsForMealHash(value: unknown): Array<{
  name: string;
  quantity: number | string;
  unit: string;
}> {
  let parsedValue: unknown = value;
  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return parsedValue
    .map((ingredient) => {
      if (!ingredient || typeof ingredient !== "object") {
        return null;
      }

      const record = ingredient as Record<string, unknown>;
      if (typeof record.name !== "string" || typeof record.unit !== "string") {
        return null;
      }

      const quantity = record.quantity;
      if (typeof quantity !== "string" && typeof quantity !== "number") {
        return null;
      }

      return {
        name: record.name,
        quantity,
        unit: record.unit,
      };
    })
    .filter(
      (
        ingredient,
      ): ingredient is {
        name: string;
        quantity: number | string;
        unit: string;
      } => Boolean(ingredient),
    );
}

function sortStringArray(input: string[]): string[] {
  return [...input].sort((left, right) => left.localeCompare(right));
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortObjectKeys(
          (value as Record<string, unknown>)[key],
        );
        return accumulator;
      }, {});
  }

  return value;
}

function buildProfileHash(input: {
  adults: number;
  children: number;
  toddlers: number;
  dietTypes: string[];
  allergens: string[];
  dislikes: string[];
  mealSelection: Record<string, DayMealSelection>;
  planDays: number;
}): string {
  const stablePayload = sortObjectKeys({
    adults: input.adults,
    children: input.children,
    toddlers: input.toddlers,
    dietTypes: sortStringArray(input.dietTypes),
    allergens: sortStringArray(input.allergens),
    dislikes: sortStringArray(input.dislikes),
    mealSelection: input.mealSelection,
    planDays: input.planDays,
  });

  return createHash("sha256")
    .update(JSON.stringify(stablePayload))
    .digest("hex");
}

function toGenerateResponse(planId: string, requestedDays: number): PlanGenerateResponse {
  return {
    planId,
    requestedDays,
    streamUrl: `/api/generation/stream?planId=${planId}`,
  };
}

async function getFreshCachedPayload(params: {
  db: any;
  userId: string;
  profileHash: string;
}): Promise<CachedPlanPayload | null> {
  const cacheCutoff = new Date(Date.now() - CACHE_TTL_MS);

  const cacheRecord = await params.db.query.planCache?.findFirst?.({
    where: and(
      eq(planCache.userId, params.userId),
      eq(planCache.profileHash, params.profileHash),
      gt(planCache.createdAt, cacheCutoff),
    ),
    orderBy: (table: any, { desc }: { desc: any }) => [desc(table.createdAt)],
  });

  if (!cacheRecord) {
    return null;
  }

  const parsedPayload = CachedPlanPayloadSchema.safeParse(cacheRecord.planJson);
  return parsedPayload.success ? parsedPayload.data : null;
}

async function materializeCachedPlanIntoShell(params: {
  db: any;
  userId: string;
  planId: string;
  payload: CachedPlanPayload;
}) {
  const shellDays = await params.db.query.days.findMany({
    where: eq(days.planId, params.planId),
  });

  const dayIdByNumber = new Map<number, string>(
    shellDays.map((day: any) => [day.dayNumber, day.id]),
  );

  const missingDayNumber = params.payload.days.find(
    (day) => !dayIdByNumber.has(day.dayNumber),
  )?.dayNumber;

  if (missingDayNumber) {
    throw new Error(`Cached plan day ${missingDayNumber} does not exist in shell.`);
  }

  const mealRows = params.payload.days.flatMap((day) => {
    const dayId = dayIdByNumber.get(day.dayNumber);

    if (!dayId) {
      return [];
    }

    return day.meals.map((meal) => ({
      dayId,
      mealType: meal.mealType,
      recipeName: meal.recipeName,
      imageUrl: meal.imageUrl ?? null,
      ingredients: meal.ingredients,
      shortSummary: meal.shortSummary,
      instructions: meal.instructions ?? null,
      mealHash: buildMealHash(
        meal.recipeName,
        meal.mealType,
        parseIngredientsForMealHash(meal.ingredients),
      ),
      cookTimeMinutes: meal.cookTimeMinutes,
    }));
  });

  await params.db.transaction(async (tx: any) => {
    for (const day of shellDays) {
      await tx.delete(meals).where(eq(meals.dayId, day.id));

      await tx
        .update(days)
        .set({ status: "success", failureReason: null })
        .where(eq(days.id, day.id));
    }

    if (mealRows.length > 0) {
      await tx.insert(meals).values(mealRows);
    }

    await tx
      .update(plans)
      .set({ generationStatus: "completed" })
      .where(and(eq(plans.id, params.planId), eq(plans.userId, params.userId)));
  });
}

async function readCompletedPlanPayload(params: {
  db: any;
  userId: string;
  planId: string;
}): Promise<CachedPlanPayload | null> {
  const completedPlan = await params.db.query.plans.findFirst({
    where: and(eq(plans.id, params.planId), eq(plans.userId, params.userId)),
    with: {
      days: {
        with: {
          meals: true,
        },
      },
    },
  });

  if (!completedPlan || completedPlan.generationStatus !== "completed") {
    return null;
  }

  const payload = {
    days: [...completedPlan.days]
      .sort((left, right) => left.dayNumber - right.dayNumber)
      .map((day) => ({
        dayNumber: day.dayNumber,
        meals: [...day.meals]
          .sort((left, right) => left.mealType.localeCompare(right.mealType))
          .map((meal) => ({
            mealType: meal.mealType,
            recipeName: meal.recipeName,
            imageUrl: meal.imageUrl,
            ingredients: meal.ingredients,
            shortSummary: meal.shortSummary,
            instructions: meal.instructions,
            cookTimeMinutes: meal.cookTimeMinutes,
          })),
      })),
  };

  const parsedPayload = CachedPlanPayloadSchema.safeParse(payload);
  return parsedPayload.success ? parsedPayload.data : null;
}

async function persistPlanCacheSafely(params: {
  db: any;
  userId: string;
  profileHash: string;
  planId: string;
}) {
  const completedPayload = await readCompletedPlanPayload({
    db: params.db,
    userId: params.userId,
    planId: params.planId,
  });

  if (!completedPayload) {
    return;
  }

  try {
    await params.db.insert(planCache).values({
      userId: params.userId,
      profileHash: params.profileHash,
      planJson: completedPayload,
    });
  } catch (cacheWriteError) {
    console.error("[plan-generation] Failed to write plan cache", {
      planId: params.planId,
      error: cacheWriteError,
    });
  }
}

function buildMealSelection(
  days: number,
  mealsPerDay: "1" | "2" | "3",
): Record<string, DayMealSelection> {
  const count = Number.parseInt(mealsPerDay, 10);
  const selection: Record<string, DayMealSelection> = {};

  for (let day = 1; day <= days; day++) {
    selection[day.toString()] = {
      breakfast: count === 3,
      lunch: count >= 2,
      dinner: true,
    };
  }

  return selection;
}

export async function createPlanShell(input: {
  db: any;
  userId: string;
  planDays: number;
  archiveExistingActive?: boolean;
}): Promise<string> {
  return input.db.transaction(async (tx: any) => {
    if (input.archiveExistingActive ?? true) {
      await tx
        .update(plans)
        .set({ isActive: false })
        .where(and(eq(plans.userId, input.userId), eq(plans.isActive, true)));
    }

    const insertedPlan = await tx
      .insert(plans)
      .values({
        userId: input.userId,
        planDays: input.planDays,
        generationStatus: "in_progress",
        startDate: new Date(),
        isActive: true,
      })
      .returning({ id: plans.id });

    const planId = insertedPlan[0]?.id;

    if (!planId) {
      throw new Error("Failed to create plan shell.");
    }

    await tx.insert(days).values(
      Array.from({ length: input.planDays }, (_, index) => ({
        planId,
        dayNumber: index + 1,
        status: "pending",
        failureReason: null,
      })),
    );

    return planId;
  });
}

export function startDetachedGeneration(input: {
  db: any;
  userId: string;
  planId: string;
  planDays: number;
  mealSelection: Record<string, DayMealSelection>;
  household: {
    adults: number;
    children: number;
    toddlers: number;
  };
  dietTypes: string[];
  allergens: string[];
  dislikes: string[];
  weeklyBudgetEuro: number;
  portionMultipliers: {
    adult: number;
    child: number;
    toddler: number;
  } | null;
  generationContext?: GenerationContext;
  profileHash?: string;
}): void {
  void (async () => {
    try {
      const summary = await runGenerationOrchestrator(input);

      if (summary.status === "completed" && input.profileHash) {
        await persistPlanCacheSafely({
          db: input.db,
          userId: input.userId,
          profileHash: input.profileHash,
          planId: input.planId,
        });
      }
    } catch (error: unknown) {
      console.error("[plan-generation] Detached orchestrator failed", {
        planId: input.planId,
        error,
      });

      try {
        await input.db
          .update(days)
          .set({
            status: "failed",
            failureReason: "provider_error",
          })
          .where(
            and(
              eq(days.planId, input.planId),
              or(eq(days.status, "pending"), eq(days.status, "generating")),
            ),
          );

        await input.db
          .update(plans)
          .set({ generationStatus: "partial_failure" })
          .where(and(eq(plans.id, input.planId), eq(plans.userId, input.userId)));
      } catch (statusUpdateError) {
        console.error("[plan-generation] Failed to mark detached generation failure", {
          planId: input.planId,
          error: statusUpdateError,
        });
      }
    }
  })();
}

export async function generatePlanForCurrentUser(params: {
  ctx: {
    db: any;
    session: { user: { id: string } };
  };
  input: PlanGenerateInput;
}): Promise<PlanGenerateResponse> {
  const { ctx, input } = params;
  const userId = ctx.session.user.id;

  const profile = await ctx.db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });

  if (!profile) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Profile not found. Please complete your household profile first.",
    });
  }

  const parsedMultipliers =
    profile.portionMultipliers == null
      ? null
      : PortionMultipliersSchema.safeParse(profile.portionMultipliers);

  if (parsedMultipliers && !parsedMultipliers.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Invalid portion multipliers in profile. Please update your household settings.",
    });
  }

  const mealSelection = buildMealSelection(input.days, input.mealsPerDay);
  const profileHash = buildProfileHash({
    adults: profile.adults,
    children: profile.children,
    toddlers: profile.toddlers,
    dietTypes: profile.dietTypes,
    allergens: profile.allergens,
    dislikes: profile.dislikes,
    mealSelection,
    planDays: input.days,
  });

  const cachedPayload = await getFreshCachedPayload({
    db: ctx.db,
    userId,
    profileHash,
  });

  let cachedPlanShellId: string | null = null;

  if (cachedPayload) {
    cachedPlanShellId = await createPlanShell({
      db: ctx.db,
      userId,
      planDays: input.days,
      archiveExistingActive: true,
    });

    try {
      await materializeCachedPlanIntoShell({
        db: ctx.db,
        userId,
        planId: cachedPlanShellId,
        payload: cachedPayload,
      });

      return toGenerateResponse(cachedPlanShellId, input.days);
    } catch (cacheMaterializationError) {
      console.error("[plan-generation] Failed to materialize cached plan", {
        planId: cachedPlanShellId,
        error: cacheMaterializationError,
      });
    }
  }

  const [dislikedRecipes, recentMealNames] = await Promise.all([
    getDislikedRecipes(ctx.db, userId),
    getRecentMealNames(ctx.db, userId, 21),
  ]);

  const generationContext: GenerationContext = {
    dislikedRecipes,
    recentMealNames,
    profileSnapshot: {
      adults: profile.adults,
      children: profile.children,
      toddlers: profile.toddlers,
      dietTypes: profile.dietTypes,
      allergens: profile.allergens,
      dislikes: profile.dislikes,
      weeklyBudgetEuro: profile.weeklyBudgetEuro,
    },
  };

  const planId =
    cachedPlanShellId ??
    (await createPlanShell({
      db: ctx.db,
      userId,
      planDays: input.days,
      archiveExistingActive: true,
    }));

  startDetachedGeneration({
    db: ctx.db,
    userId,
    planId,
    planDays: input.days,
    mealSelection,
    household: {
      adults: profile.adults,
      children: profile.children,
      toddlers: profile.toddlers,
    },
    dietTypes: profile.dietTypes,
    allergens: profile.allergens,
    dislikes: profile.dislikes,
    weeklyBudgetEuro: profile.weeklyBudgetEuro,
    portionMultipliers:
      parsedMultipliers && parsedMultipliers.success
        ? parsedMultipliers.data
        : null,
    generationContext,
    profileHash,
  });

  return toGenerateResponse(planId, input.days);
}
