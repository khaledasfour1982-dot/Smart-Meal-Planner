import { beforeEach, describe, expect, it, vi } from "vitest";

const generationMocks = vi.hoisted(() => ({
  generateMealPlan: vi.fn(),
}));

const pixabayMocks = vi.hoisted(() => ({
  fetchPixabayImage: vi.fn(),
}));

vi.mock("~/server/services/meal-generator.service", () => ({
  generateMealPlan: generationMocks.generateMealPlan,
}));

vi.mock("~/server/ai/pixabay-image", () => ({
  fetchPixabayImage: pixabayMocks.fetchPixabayImage,
}));

import {
  PLAN_GENERATION_REASONS,
  PlanGenerationError,
} from "~/server/ai/errors";
import { generatePlanDay } from "~/server/services/day-generation.service";

function createDbMock() {
  const updateWhere = vi.fn();
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const txDeleteWhere = vi.fn();
  const txDelete = vi.fn(() => ({ where: txDeleteWhere }));
  const txInsertValues = vi.fn().mockResolvedValue(undefined);
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));

  const transaction = vi.fn(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        delete: txDelete,
        insert: txInsert,
        update: txUpdate,
      }),
  );

  const findFirstPlan = vi.fn().mockResolvedValue({ id: "plan-1" });
  const findFirstDay = vi.fn().mockResolvedValue({
    id: "day-1",
    planId: "plan-1",
    dayNumber: 2,
  });

  return {
    db: {
      query: {
        plans: { findFirst: findFirstPlan },
        days: { findFirst: findFirstDay },
      },
      update,
      transaction,
    },
    spies: {
      update,
      updateSet,
      updateWhere,
      transaction,
      txDelete,
      txDeleteWhere,
      txInsert,
      txInsertValues,
      txUpdate,
      txUpdateSet,
      txUpdateWhere,
      findFirstPlan,
      findFirstDay,
    },
  };
}

const baseInput = {
  userId: "user-1",
  planId: "plan-1",
  dayNumber: 2,
  household: {
    adults: 2,
    children: 1,
    toddlers: 0,
  },
  dietTypes: ["vegetarian"],
  allergens: ["peanuts"],
  dislikes: ["olives"],
  weeklyBudgetEuro: 80,
  portionMultipliers: null,
  daySelection: {
    breakfast: false,
    lunch: false,
    dinner: true,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  pixabayMocks.fetchPixabayImage.mockResolvedValue(null);
});

describe("generatePlanDay", () => {
  it("persists generating -> success and stores generated meals", async () => {
    const { db, spies } = createDbMock();
    pixabayMocks.fetchPixabayImage.mockResolvedValue(
      "https://cdn.example.com/veggie-stir-fry.jpg",
    );

    generationMocks.generateMealPlan.mockResolvedValue({
      days: [
        {
          dayNumber: 1,
          totalEstimatedCostEuro: 10,
          meals: [
            {
              mealType: "dinner",
              recipeName: "Veggie Stir Fry",
              imageUrl: "",
              ingredients: [],
              instructions: "Cook",
              cookTimeMinutes: 20,
            },
          ],
        },
      ],
    });

    const result = await generatePlanDay({
      ...baseInput,
      db: db as any,
    });

    expect(generationMocks.generateMealPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        planDays: 1,
        mealSelection: {
          "1": baseInput.daySelection,
        },
      }),
    );

    expect(result).toEqual({
      status: "success",
      planId: "plan-1",
      dayId: "day-1",
      dayNumber: 2,
      generatedMeals: 1,
    });

    expect(spies.updateSet).toHaveBeenNthCalledWith(1, {
      status: "generating",
      failureReason: null,
    });

    expect(spies.transaction).toHaveBeenCalledOnce();
    expect(spies.txDelete).toHaveBeenCalledOnce();
    expect(spies.txInsertValues).toHaveBeenCalledOnce();
    expect(spies.txInsertValues).toHaveBeenCalledWith([
      expect.objectContaining({
        imageUrl: "https://cdn.example.com/veggie-stir-fry.jpg",
      }),
    ]);
    expect(pixabayMocks.fetchPixabayImage).toHaveBeenCalledWith(
      "Veggie Stir Fry",
    );
    expect(spies.txUpdateSet).toHaveBeenCalledWith({
      status: "success",
      failureReason: null,
    });
  });

  it("persists failed + allergen_exhaustion when allergen retries are exhausted", async () => {
    const { db, spies } = createDbMock();

    generationMocks.generateMealPlan.mockRejectedValue(
      new PlanGenerationError("Allergen retries exhausted.", {
        reason: PLAN_GENERATION_REASONS.ALLERGEN_VIOLATION,
        attempts: 3,
      }),
    );

    const result = await generatePlanDay({
      ...baseInput,
      db: db as any,
    });

    expect(result).toEqual({
      status: "failed",
      planId: "plan-1",
      dayId: "day-1",
      dayNumber: 2,
      failureReason: "allergen_exhaustion",
      attempts: 3,
      generationReason: PLAN_GENERATION_REASONS.ALLERGEN_VIOLATION,
    });

    expect(spies.updateSet).toHaveBeenNthCalledWith(1, {
      status: "generating",
      failureReason: null,
    });
    expect(spies.updateSet).toHaveBeenNthCalledWith(2, {
      status: "failed",
      failureReason: "allergen_exhaustion",
    });
    expect(spies.transaction).not.toHaveBeenCalled();
  });

  it("persists failed + provider_error on provider failure", async () => {
    const { db, spies } = createDbMock();

    generationMocks.generateMealPlan.mockRejectedValue(
      new PlanGenerationError("Provider unavailable.", {
        reason: PLAN_GENERATION_REASONS.PROVIDER_ERROR,
        attempts: 1,
      }),
    );

    const result = await generatePlanDay({
      ...baseInput,
      db: db as any,
    });

    expect(result).toEqual({
      status: "failed",
      planId: "plan-1",
      dayId: "day-1",
      dayNumber: 2,
      failureReason: "provider_error",
      attempts: 1,
      generationReason: PLAN_GENERATION_REASONS.PROVIDER_ERROR,
    });

    expect(spies.updateSet).toHaveBeenNthCalledWith(2, {
      status: "failed",
      failureReason: "provider_error",
    });
    expect(spies.transaction).not.toHaveBeenCalled();
  });
});
