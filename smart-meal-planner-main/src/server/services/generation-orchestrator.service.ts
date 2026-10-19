/**
 * Generates plan days in chunked parallel batches (max 3 at a time)
 * to improve throughput while preserving per-day fallback behavior and stable
 * outcome ordering by day number within each completed chunk.
 */
import { and, eq } from "drizzle-orm";
import type { DayMealSelection } from "~/server/ai/meal-plan-prompt";
import type { GenerationContext } from "~/server/ai/types";
import { plans } from "~/server/db/schema";
import {
  generatePlanDay,
  type DayGenerationResult,
  type GeneratePlanDayInput,
} from "~/server/services/day-generation.service";

export type GenerationOrchestratorStatus = "completed" | "partial_failure";

export interface GenerationOrchestratorInput {
  db: GeneratePlanDayInput["db"];
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
}

export interface GenerationOrchestratorSummary {
  status: GenerationOrchestratorStatus;
  succeededDays: number[];
  failedDays: number[];
  outcomes: DayGenerationResult[];
}

const defaultDaySelection: DayMealSelection = {
  breakfast: true,
  lunch: true,
  dinner: true,
};

const MAX_CONCURRENCY = 3;

async function setPlanGenerationStatus(input: {
  db: GeneratePlanDayInput["db"];
  planId: string;
  userId: string;
  status: "in_progress" | "completed" | "partial_failure";
}) {
  await input.db
    .update(plans)
    .set({ generationStatus: input.status })
    .where(and(eq(plans.id, input.planId), eq(plans.userId, input.userId)));
}

function buildDaySelection(
  selectionMap: Record<string, DayMealSelection>,
  dayNumber: number,
): DayMealSelection {
  return selectionMap[dayNumber.toString()] ?? defaultDaySelection;
}

function toFinalStatus(failedDays: number[]): GenerationOrchestratorStatus {
  return failedDays.length > 0 ? "partial_failure" : "completed";
}

export async function runGenerationOrchestrator(
  input: GenerationOrchestratorInput,
): Promise<GenerationOrchestratorSummary> {
  const outcomes: DayGenerationResult[] = [];

  await setPlanGenerationStatus({
    db: input.db,
    planId: input.planId,
    userId: input.userId,
    status: "in_progress",
  });

  for (
    let chunkStartDay = 1;
    chunkStartDay <= input.planDays;
    chunkStartDay += MAX_CONCURRENCY
  ) {
    const chunkEndDay = Math.min(
      chunkStartDay + MAX_CONCURRENCY - 1,
      input.planDays,
    );

    const chunkDayNumbers = Array.from(
      { length: chunkEndDay - chunkStartDay + 1 },
      (_, index) => chunkStartDay + index,
    );

    const chunkOutcomes = await Promise.all(
      chunkDayNumbers.map(async (dayNumber) => {
        try {
          return await generatePlanDay({
            db: input.db,
            userId: input.userId,
            planId: input.planId,
            dayNumber,
            daySelection: buildDaySelection(input.mealSelection, dayNumber),
            household: input.household,
            dietTypes: input.dietTypes,
            allergens: input.allergens,
            dislikes: input.dislikes,
            weeklyBudgetEuro: input.weeklyBudgetEuro,
            portionMultipliers: input.portionMultipliers,
            generationContext: input.generationContext,
          });
        } catch {
          return {
            status: "failed",
            planId: input.planId,
            dayId: `unresolved-day-${dayNumber}`,
            dayNumber,
            failureReason: "provider_error",
            attempts: 1,
            generationReason: "unhandled_error",
          } satisfies DayGenerationResult;
        }
      }),
    );

    chunkOutcomes
      .sort((left, right) => left.dayNumber - right.dayNumber)
      .forEach((outcome) => {
        outcomes.push(outcome);
      });
  }

  const succeededDays = outcomes
    .filter((outcome) => outcome.status === "success")
    .map((outcome) => outcome.dayNumber);

  const failedDays = outcomes
    .filter((outcome) => outcome.status === "failed")
    .map((outcome) => outcome.dayNumber);

  const finalStatus = toFinalStatus(failedDays);

  await setPlanGenerationStatus({
    db: input.db,
    planId: input.planId,
    userId: input.userId,
    status: finalStatus,
  });

  return {
    status: finalStatus,
    succeededDays,
    failedDays,
    outcomes,
  };
}
