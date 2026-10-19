import { and, eq } from "drizzle-orm";
import { validateAllergens } from "~/server/ai/allergen-validator";
import { AllergenViolationError } from "~/server/ai/errors";
import { buildMealHash } from "~/server/ai/meal-hash";
import { fetchPixabayImage } from "~/server/ai/pixabay-image";
import {
  PLAN_GENERATION_REASONS,
  PlanGenerationError,
} from "~/server/ai/errors";
import type { DayMealSelection } from "~/server/ai/meal-plan-prompt";
import { INSTRUCTIONS_PLACEHOLDER } from "~/server/ai/types";
import { days, meals, plans } from "~/server/db/schema";
import { generateMealPlan, type GenerateInput } from "~/server/services/meal-generator.service";

const MAX_DAY_ALLERGEN_ATTEMPTS = 3;
const SLOT_RETRY_ATTEMPTS = 2;

type MealType = "breakfast" | "lunch" | "dinner";

export const DAY_FAILURE_REASONS = {
  ALLERGEN_EXHAUSTION: "allergen_exhaustion",
  PROVIDER_ERROR: "provider_error",
} as const;

export type DayFailureReason =
  (typeof DAY_FAILURE_REASONS)[keyof typeof DAY_FAILURE_REASONS];

export interface GeneratePlanDayInput
  extends Omit<GenerateInput, "planDays" | "mealSelection"> {
  db: NonNullable<GenerateInput["db"]>;
  userId: NonNullable<GenerateInput["userId"]>;
  planId: string;
  dayNumber: number;
  daySelection: DayMealSelection;
  hint?: string;
  regenerateOnlyOneMeal?: "breakfast" | "lunch" | "dinner";
}

export type DayGenerationResult =
  | {
      status: "success";
      planId: string;
      dayId: string;
      dayNumber: number;
      generatedMeals: number;
    }
  | {
      status: "failed";
      planId: string;
      dayId: string;
      dayNumber: number;
      failureReason: DayFailureReason;
      attempts: number;
      generationReason: string;
    };

function mapPlanErrorToDayFailureReason(error: PlanGenerationError): DayFailureReason {
  if (error.reason === PLAN_GENERATION_REASONS.ALLERGEN_VIOLATION) {
    return DAY_FAILURE_REASONS.ALLERGEN_EXHAUSTION;
  }

  return DAY_FAILURE_REASONS.PROVIDER_ERROR;
}

function buildSingleDayGenerateInput(input: GeneratePlanDayInput): GenerateInput {
  return {
    db: input.db,
    userId: input.userId,
    household: input.household,
    dietTypes: input.dietTypes,
    allergens: input.allergens,
    dislikes: input.dislikes,
    portionMultipliers: input.portionMultipliers,
    weeklyBudgetEuro: input.weeklyBudgetEuro,
    generationContext: input.generationContext,
    planDays: 1,
    mealSelection: {
      "1": input.daySelection,
    },
    hints: input.hint ? { "1": input.hint } : undefined,
  };
}

function isMealSelected(
  selection: DayMealSelection,
  mealType: MealType,
): boolean {
  return selection[mealType];
}

function buildSingleSlotSelection(mealType: MealType): DayMealSelection {
  return {
    breakfast: mealType === "breakfast",
    lunch: mealType === "lunch",
    dinner: mealType === "dinner",
  };
}

function getSelectedMealTypes(selection: DayMealSelection): MealType[] {
  const allMealTypes: MealType[] = ["breakfast", "lunch", "dinner"];
  return allMealTypes.filter((mealType) => selection[mealType]);
}

async function persistRetryState(params: {
  db: NonNullable<GenerateInput["db"]>;
  dayId: string;
  mealType: MealType;
  dayNumber: number;
  attempt: number;
}): Promise<void> {
  const message =
    `Allergen retry for ${params.mealType} on day ${params.dayNumber} ` +
    `(attempt ${params.attempt}/${SLOT_RETRY_ATTEMPTS}).`;

  await params.db
    .update(days)
    .set({ status: "retrying", failureReason: message })
    .where(eq(days.id, params.dayId));
}

async function retryFailedMealSlot(params: {
  input: GeneratePlanDayInput;
  dayId: string;
  mealType: MealType;
}): Promise<{ replacementMeal: NonNullable<Awaited<ReturnType<typeof generateMealPlan>>["days"][number]["meals"][number]>; attemptsUsed: number }> {
  for (let attempt = 1; attempt <= SLOT_RETRY_ATTEMPTS; attempt++) {
    await persistRetryState({
      db: params.input.db,
      dayId: params.dayId,
      mealType: params.mealType,
      dayNumber: params.input.dayNumber,
      attempt,
    });

    const slotInput = {
      ...params.input,
      daySelection: buildSingleSlotSelection(params.mealType),
    };

    let generatedDay: Awaited<ReturnType<typeof generateMealPlan>>["days"][number] | undefined;

    try {
      const generatedPlan = await generateMealPlan(buildSingleDayGenerateInput(slotInput));
      generatedDay = generatedPlan.days[0];
    } catch (error) {
      if (
        error instanceof PlanGenerationError &&
        error.reason === PLAN_GENERATION_REASONS.ALLERGEN_VIOLATION
      ) {
        if (attempt === SLOT_RETRY_ATTEMPTS) {
          throw new PlanGenerationError(
            `Could not generate an allergen-safe ${params.mealType} meal after slot retries.`,
            {
              attempts: MAX_DAY_ALLERGEN_ATTEMPTS,
              reason: PLAN_GENERATION_REASONS.ALLERGEN_VIOLATION,
              metadata: {
                step: "slot_retry",
                mealType: params.mealType,
              },
            },
          );
        }

        continue;
      }

      throw error;
    }

    const replacementMeal = generatedDay?.meals.find((meal) => meal.mealType === params.mealType);
    if (!replacementMeal) {
      throw new PlanGenerationError("Missing generated meal for slot retry.", {
        attempts: attempt,
        reason: PLAN_GENERATION_REASONS.PROVIDER_ERROR,
        metadata: {
          step: "slot_retry",
          mealType: params.mealType,
        },
      });
    }

    try {
      validateAllergens(replacementMeal.ingredients, params.input.allergens);
      return { replacementMeal, attemptsUsed: attempt };
    } catch (error) {
      if (error instanceof AllergenViolationError) {
        if (attempt === SLOT_RETRY_ATTEMPTS) {
          throw new PlanGenerationError(
            `Could not generate an allergen-safe ${params.mealType} meal after slot retries.`,
            {
              attempts: MAX_DAY_ALLERGEN_ATTEMPTS,
              reason: PLAN_GENERATION_REASONS.ALLERGEN_VIOLATION,
              metadata: {
                step: "slot_retry",
                mealType: params.mealType,
                violatingIngredientCount: error.violatingIngredients.length,
              },
            },
          );
        }

        continue;
      }

      throw error;
    }
  }

  throw new PlanGenerationError("Slot retry loop exhausted unexpectedly.", {
    attempts: MAX_DAY_ALLERGEN_ATTEMPTS,
    reason: PLAN_GENERATION_REASONS.ALLERGEN_VIOLATION,
    metadata: { step: "slot_retry_unknown" },
  });
}

export async function generatePlanDay(input: GeneratePlanDayInput): Promise<DayGenerationResult> {
  const planRecord = await input.db.query.plans.findFirst({
    where: and(eq(plans.id, input.planId), eq(plans.userId, input.userId)),
  });

  if (!planRecord) {
    throw new Error("Forbidden: plan does not belong to current user.");
  }

  const dayRecord = await input.db.query.days.findFirst({
    where: and(eq(days.planId, input.planId), eq(days.dayNumber, input.dayNumber)),
  });

  if (!dayRecord) {
    throw new Error(`Day ${input.dayNumber} not found in plan ${input.planId}.`);
  }

  await input.db
    .update(days)
    .set({ status: "generating", failureReason: null })
    .where(eq(days.id, dayRecord.id));

  const singleDayInput = buildSingleDayGenerateInput(input);

  try {
    const generatedPlan = await generateMealPlan(singleDayInput);
    const generatedDay = generatedPlan.days[0];

    if (!generatedDay) {
      throw new PlanGenerationError("Missing generated day payload.", {
        reason: PLAN_GENERATION_REASONS.PROVIDER_ERROR,
      });
    }

    const nextMeals = generatedDay.meals.filter((meal) =>
      isMealSelected(input.daySelection, meal.mealType),
    );

    const selectedMealTypes = getSelectedMealTypes(input.daySelection);
    const mealByType = new Map<MealType, (typeof nextMeals)[number]>(
      nextMeals.map((meal) => [meal.mealType, meal]),
    );

    for (const mealType of selectedMealTypes) {
      const currentMeal = mealByType.get(mealType);
      if (!currentMeal) {
        continue;
      }

      try {
        validateAllergens(currentMeal.ingredients, input.allergens);
      } catch (error) {
        if (!(error instanceof AllergenViolationError)) {
          throw error;
        }

        const slotRetryResult = await retryFailedMealSlot({
          input,
          dayId: dayRecord.id,
          mealType,
        });

        mealByType.set(mealType, slotRetryResult.replacementMeal);
      }
    }

    const resolvedMeals = selectedMealTypes
      .map((mealType) => mealByType.get(mealType))
      .filter((meal): meal is (typeof nextMeals)[number] => Boolean(meal));

    const enrichedMeals = await Promise.all(
      resolvedMeals.map(async (meal) => ({
        ...meal,
        imageUrl: (await fetchPixabayImage(meal.recipeName)) ?? null,
      })),
    );

    const generatedMeals = await input.db.transaction(async (tx: any) => {
      if (input.regenerateOnlyOneMeal) {
        await tx.delete(meals).where(and(eq(meals.dayId, dayRecord.id), eq(meals.mealType, input.regenerateOnlyOneMeal)));
      } else {
        await tx.delete(meals).where(eq(meals.dayId, dayRecord.id));
      }

      if (enrichedMeals.length > 0) {
        await tx.insert(meals).values(
          enrichedMeals.map((meal) => ({
            dayId: dayRecord.id,
            mealType: meal.mealType,
            recipeName: meal.recipeName,
            imageUrl: meal.imageUrl,
            ingredients: meal.ingredients,
            shortSummary: meal.shortSummary,
            instructions: INSTRUCTIONS_PLACEHOLDER,
            mealHash: buildMealHash(
              meal.recipeName,
              meal.mealType,
              meal.ingredients
            ),
            cookTimeMinutes: meal.cookTimeMinutes,
          })),
        );
      }

      await tx
        .update(days)
        .set({ status: "success", failureReason: null })
        .where(eq(days.id, dayRecord.id));

      return enrichedMeals.length;
    });

    return {
      status: "success",
      planId: input.planId,
      dayId: dayRecord.id,
      dayNumber: input.dayNumber,
      generatedMeals,
    };
  } catch (error) {
    if (!(error instanceof PlanGenerationError)) {
      throw error;
    }

    const failureReason = mapPlanErrorToDayFailureReason(error);

    await input.db
      .update(days)
      .set({ status: "failed", failureReason })
      .where(eq(days.id, dayRecord.id));

    return {
      status: "failed",
      planId: input.planId,
      dayId: dayRecord.id,
      dayNumber: input.dayNumber,
      failureReason,
      attempts: Math.min(error.attempts, MAX_DAY_ALLERGEN_ATTEMPTS),
      generationReason: error.reason,
    };
  }
}
