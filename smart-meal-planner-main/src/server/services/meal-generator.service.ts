/**
 * Uses pre-fetched generation context (disliked + recent meals)
 * instead of querying exclusions from DB during prompt assembly.
 */
import {
  AllergenViolationError,
  PLAN_GENERATION_REASONS,
  PlanGenerationError,
  type PlanGenerationReason,
} from "~/server/ai/errors";
import { MealPlanSchema } from "~/server/ai/meal-plan-schema";
import type { MealPlan } from "~/server/ai/meal-plan-schema";
import { buildMealPlanPrompt } from "~/server/ai/meal-plan-prompt";
import type { DayMealSelection, PromptInput } from "~/server/ai/meal-plan-prompt";
import type { GenerationContext } from "~/server/ai/types";
import { validateAllergens } from "~/server/ai/allergen-validator";
import { UNIT_NORMALIZER } from "~/server/ai/unit-normalizer";
import { scaleIngredients } from "~/server/ai/portion-scaler";
import type { PortionMultipliers } from "~/server/ai/portion-scaler";
import {
  createJsonCompletion,
  getAiProvider,
  type CompletionMetadata,
} from "~/server/services/ai-provider.service";

const MAX_ATTEMPTS = 3;
const isDev = process.env.NODE_ENV !== "production";
type MealGeneratorDb = typeof import("~/server/db").db;

export interface GenerateInput {
  db?: MealGeneratorDb;
  userId?: string;
  household: {
    adults: number;
    children: number;
    toddlers: number;
  };
  dietTypes: string[];
  allergens: string[];
  dislikes: string[];
  planDays: number;
  mealSelection: Record<string, DayMealSelection>;
  hints?: Record<string, string>;
  portionMultipliers?: PortionMultipliers | null;
  weeklyBudgetEuro?: number | null;
  generationContext?: GenerationContext;
}

function getRequestedMealCount(mealSelection: Record<string, DayMealSelection>): number {
  return Object.values(mealSelection).reduce((total, daySelection) => {
    return (
      total +
      Number(daySelection.breakfast) +
      Number(daySelection.lunch) +
      Number(daySelection.dinner)
    );
  }, 0);
}

function detectConstraintConflict(dietTypes: string[]): string | null {
  const normalized = new Set(dietTypes.map((diet) => diet.trim().toLowerCase()));
  const contradictoryPairs: Array<[string, string]> = [
    ["vegan", "keto"],
    ["vegan", "paleo"],
    ["vegan", "carnivore"],
    ["vegetarian", "carnivore"],
  ];

  for (const [left, right] of contradictoryPairs) {
    if (normalized.has(left) && normalized.has(right)) {
      return `${left}+${right}`;
    }
  }

  return null;
}

function classifyProviderErrorReason(message: string): PlanGenerationReason {
  const lowered = message.toLowerCase();

  if (
    lowered.includes("max token") ||
    lowered.includes("token limit") ||
    lowered.includes("context length") ||
    lowered.includes("context window") ||
    lowered.includes("too many token")
  ) {
    return PLAN_GENERATION_REASONS.TOKEN_LIMIT_EXCEEDED;
  }

  if (
    lowered.includes("429") ||
    lowered.includes("rate limit") ||
    lowered.includes("timeout") ||
    lowered.includes("timed out") ||
    lowered.includes("deadline") ||
    lowered.includes("503") ||
    lowered.includes("504") ||
    lowered.includes("too many requests")
  ) {
    return PLAN_GENERATION_REASONS.MODEL_TIMEOUT_OR_RATE_LIMIT;
  }

  return PLAN_GENERATION_REASONS.PROVIDER_ERROR;
}

function normalizeModelResponseJson(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") {
    return parsed;
  }

  const asRecord = parsed as Record<string, unknown>;
  const days = asRecord.days;

  if (!Array.isArray(days)) {
    return parsed;
  }

  for (const day of days) {
    if (!day || typeof day !== "object") {
      continue;
    }

    const dayRecord = day as Record<string, unknown>;
    const meals = dayRecord.meals;
    let computedDayTotal = 0;

    if (typeof dayRecord.totalEstimatedCostEuro !== "number" || dayRecord.totalEstimatedCostEuro <= 0) {
      dayRecord.totalEstimatedCostEuro = undefined;
    }

    if (!Array.isArray(meals)) {
      continue;
    }

    for (const meal of meals) {
      if (!meal || typeof meal !== "object") {
        continue;
      }

      const ingredients = (meal as Record<string, unknown>).ingredients;
      if (!Array.isArray(ingredients)) {
        continue;
      }

      for (const ingredient of ingredients) {
        if (!ingredient || typeof ingredient !== "object") {
          continue;
        }

        const ingredientRecord = ingredient as Record<string, unknown>;

        if (typeof ingredientRecord.unit === "string") {
          const normalizedUnit = UNIT_NORMALIZER[ingredientRecord.unit.trim().toLowerCase()];
          if (normalizedUnit) {
            ingredientRecord.unit = normalizedUnit;
          }
        }

        if (typeof ingredientRecord.quantity === "number" && ingredientRecord.quantity <= 0) {
          ingredientRecord.quantity = 1;
        }

        if (typeof ingredientRecord.estPriceEuro !== "number" || ingredientRecord.estPriceEuro <= 0) {
          ingredientRecord.estPriceEuro = 0.01;
        }

        computedDayTotal += ingredientRecord.estPriceEuro as number;
      }
    }

    if (typeof dayRecord.totalEstimatedCostEuro !== "number") {
      dayRecord.totalEstimatedCostEuro = computedDayTotal > 0 ? computedDayTotal : 0.01;
    }
  }

  return parsed;
}

function logAttemptFailure(params: {
  attempt: number;
  requestedMealCount: number;
  reason: PlanGenerationReason;
  step: string;
  allergenCount: number;
  metadata?: CompletionMetadata;
  violatingIngredientCount?: number;
}): void {
  if (!isDev) {
    return;
  }

  console.warn("[meal-generation] attempt failed", {
    attempt: params.attempt,
    requestedMealCount: params.requestedMealCount,
    reason: params.reason,
    step: params.step,
    allergenCount: params.allergenCount,
    violatingIngredientCount: params.violatingIngredientCount,
    finishReason: params.metadata?.finishReason,
    isTruncated: params.metadata?.isTruncated,
    promptTokens: params.metadata?.promptTokens,
    completionTokens: params.metadata?.completionTokens,
    totalTokens: params.metadata?.totalTokens,
  });
}

async function callModel(
  promptInput: PromptInput,
  attempt: number,
): Promise<{ content: string; metadata?: CompletionMetadata }> {
  const { systemPrompt, userMessage } = buildMealPlanPrompt(promptInput);

  try {
    return await createJsonCompletion({ systemPrompt, userMessage });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI API error";
    const provider = getAiProvider();
    const reason = classifyProviderErrorReason(message);

    throw new PlanGenerationError(
      reason === PLAN_GENERATION_REASONS.MODEL_TIMEOUT_OR_RATE_LIMIT
        ? `${provider} is temporarily unavailable. Please try again in a moment.`
        : `Meal plan generation failed: ${message}`,
      {
        attempts: attempt,
        reason,
        metadata: { step: "provider_request" },
      },
    );
  }
}

export async function generateMealPlan(input: GenerateInput): Promise<MealPlan> {
  const conflict = detectConstraintConflict(input.dietTypes);
  if (conflict) {
    throw new PlanGenerationError("Detected conflicting dietary constraints.", {
      attempts: 1,
      reason: PLAN_GENERATION_REASONS.CONSTRAINT_CONFLICT,
      metadata: { step: "pre_validation", conflict },
    });
  }

  const dislikedRecipes = input.generationContext?.dislikedRecipes ?? [];
  const recentMealNames = input.generationContext?.recentMealNames ?? [];

  console.log("[meal-generation] disliked_recipe_exclusions", {
    count: dislikedRecipes.length,
    recipes: dislikedRecipes,
  });

  const promptInput: PromptInput = {
    household: input.household,
    dietTypes: input.dietTypes,
    allergens: input.allergens,
    dislikes: input.dislikes,
    dislikedRecipes,
    recentMealNames,
    planDays: input.planDays,
    mealSelection: input.mealSelection,
    hints: input.hints,
    weeklyBudgetEuro: input.weeklyBudgetEuro ?? undefined,
  };

  const requestedMealCount = getRequestedMealCount(input.mealSelection);
  const allergenCount = input.allergens.length;
  let lastFailure: PlanGenerationError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const modelResult = await callModel(promptInput, attempt);
      const content = modelResult.content.trim();

      if (!content) {
        throw new PlanGenerationError("Model response was empty.", {
          attempts: attempt,
          reason: PLAN_GENERATION_REASONS.EMPTY_OR_TRUNCATED_RESPONSE,
          metadata: {
            step: "provider_response",
            ...modelResult.metadata,
          },
        });
      }

      if (modelResult.metadata?.isTruncated || modelResult.metadata?.finishReason === "length") {
        throw new PlanGenerationError("Model output hit token limits.", {
          attempts: attempt,
          reason: PLAN_GENERATION_REASONS.TOKEN_LIMIT_EXCEEDED,
          metadata: {
            step: "provider_response",
            ...modelResult.metadata,
          },
        });
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(content) as unknown;
        parsedJson = normalizeModelResponseJson(parsedJson);
      } catch {
        throw new PlanGenerationError("Invalid JSON returned by model.", {
          attempts: attempt,
          reason: PLAN_GENERATION_REASONS.SCHEMA_VALIDATION_FAILURE,
          metadata: {
            step: "json_parse",
            ...modelResult.metadata,
          },
        });
      }

      let plan: MealPlan;
        try {
          plan = MealPlanSchema.parse(parsedJson);
        } catch (zodError) {
          if (isDev) {
            // Log first 500 chars of raw model response
            const preview = typeof content === "string" ? content.slice(0, 500) : "";
            console.debug("[meal-generation] raw_response_preview", { preview });
            // Log Zod error details
            if (zodError && typeof zodError === "object" && "issues" in zodError) {
              console.debug("[meal-generation] schema_error", { issues: zodError.issues });
            }
          }
          throw new PlanGenerationError("Schema validation failed for generated plan.", {
            attempts: attempt,
            reason: PLAN_GENERATION_REASONS.SCHEMA_VALIDATION_FAILURE,
            metadata: {
              step: "schema_validation",
              ...modelResult.metadata,
            },
          });
        }

      const allIngredients = plan.days.flatMap((day) =>
        day.meals.flatMap((meal) => meal.ingredients),
      );

      try {
        validateAllergens(allIngredients, input.allergens);
      } catch (err) {
        if (err instanceof AllergenViolationError) {
          throw new PlanGenerationError("Generated meal plan contains allergen conflicts.", {
            attempts: attempt,
            reason: PLAN_GENERATION_REASONS.ALLERGEN_VIOLATION,
            metadata: {
              step: "allergen_validation",
              violatingIngredientCount: err.violatingIngredients.length,
            },
          });
        }
        throw err;
      }

      return {
        days: plan.days.map((day) => ({
          ...day,
          meals: day.meals.map((meal) => ({
            ...meal,
            ingredients: scaleIngredients(
              meal.ingredients,
              input.household,
              input.portionMultipliers,
            ),
          })),
        })),
      };
    } catch (err) {
      if (err instanceof PlanGenerationError) {
        lastFailure = err;
        logAttemptFailure({
          attempt,
          requestedMealCount,
          reason: err.reason,
          step:
            typeof err.metadata?.step === "string" ? err.metadata.step : "unknown_step",
          allergenCount,
          metadata: {
            promptTokens:
              typeof err.metadata?.promptTokens === "number"
                ? err.metadata.promptTokens
                : undefined,
            completionTokens:
              typeof err.metadata?.completionTokens === "number"
                ? err.metadata.completionTokens
                : undefined,
            totalTokens:
              typeof err.metadata?.totalTokens === "number"
                ? err.metadata.totalTokens
                : undefined,
            finishReason:
              typeof err.metadata?.finishReason === "string" ||
              err.metadata?.finishReason === null
                ? (err.metadata.finishReason as string | null)
                : undefined,
            isTruncated:
              typeof err.metadata?.isTruncated === "boolean"
                ? err.metadata.isTruncated
                : undefined,
          },
          violatingIngredientCount:
            typeof err.metadata?.violatingIngredientCount === "number"
              ? err.metadata.violatingIngredientCount
              : undefined,
        });

        if (
          err.reason === PLAN_GENERATION_REASONS.CONSTRAINT_CONFLICT ||
          err.reason === PLAN_GENERATION_REASONS.TOKEN_LIMIT_EXCEEDED
        ) {
          break;
        }

        continue;
      }
      throw err;
    }
  }

  if (lastFailure) {
    const exhaustedReason = lastFailure.reason;
    const exhaustedMessage =
      exhaustedReason === PLAN_GENERATION_REASONS.ALLERGEN_VIOLATION
        ? "Could not generate an allergen-safe plan within the retry limit."
        : exhaustedReason === PLAN_GENERATION_REASONS.SCHEMA_VALIDATION_FAILURE
          ? "Model repeatedly returned an invalid meal plan structure."
          : exhaustedReason === PLAN_GENERATION_REASONS.EMPTY_OR_TRUNCATED_RESPONSE
            ? "Model repeatedly returned empty or truncated output."
            : exhaustedReason === PLAN_GENERATION_REASONS.MODEL_TIMEOUT_OR_RATE_LIMIT
              ? "Meal generation provider is busy or timed out across retries."
              : exhaustedReason === PLAN_GENERATION_REASONS.TOKEN_LIMIT_EXCEEDED
                ? "Meal generation exceeded model token limits."
                : exhaustedReason === PLAN_GENERATION_REASONS.CONSTRAINT_CONFLICT
                  ? "Detected conflicting constraints that prevent plan generation."
                  : "Meal plan generation failed due to provider errors.";

    throw new PlanGenerationError(exhaustedMessage, {
      attempts: MAX_ATTEMPTS,
      reason: exhaustedReason,
      metadata: lastFailure.metadata,
    });
  }

  throw new PlanGenerationError("Meal plan generation failed for unknown reasons.", {
    attempts: MAX_ATTEMPTS,
    reason: PLAN_GENERATION_REASONS.PROVIDER_ERROR,
    metadata: { step: "unknown" },
  });
}
