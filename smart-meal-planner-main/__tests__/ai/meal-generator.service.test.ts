import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const aiProviderMocks = vi.hoisted(() => ({
  createJsonCompletion: vi.fn(),
  getAiProvider: vi.fn(),
}));

const feedbackExclusionMocks = vi.hoisted(() => ({
  getDislikedRecipes: vi.fn(),
}));

const promptBuilderMocks = vi.hoisted(() => ({
  buildMealPlanPrompt: vi.fn(),
}));

vi.mock("~/server/services/ai-provider.service", () => ({
  createJsonCompletion: aiProviderMocks.createJsonCompletion,
  getAiProvider: aiProviderMocks.getAiProvider,
}));

vi.mock("~/server/ai/feedback-exclusions", () => ({
  getDislikedRecipes: feedbackExclusionMocks.getDislikedRecipes,
}));

vi.mock("~/server/ai/meal-plan-prompt", async () => {
  const actual = await vi.importActual<typeof import("~/server/ai/meal-plan-prompt")>(
    "~/server/ai/meal-plan-prompt",
  );

  promptBuilderMocks.buildMealPlanPrompt.mockImplementation(actual.buildMealPlanPrompt);

  return {
    ...actual,
    buildMealPlanPrompt: promptBuilderMocks.buildMealPlanPrompt,
  };
});

import {
  PLAN_GENERATION_REASONS,
  PlanGenerationError,
  type PlanGenerationReason,
} from "~/server/ai/errors";
import {
  generateMealPlan,
  type GenerateInput,
} from "~/server/services/meal-generator.service";

const baseInput: GenerateInput = {
  household: {
    adults: 1,
    children: 0,
    toddlers: 0,
  },
  dietTypes: [],
  allergens: [],
  dislikes: [],
  planDays: 1,
  mealSelection: {
    "1": { breakfast: false, lunch: false, dinner: true },
  },
  portionMultipliers: null,
  weeklyBudgetEuro: null,
};

const validModelPlan = {
  days: [
    {
      dayNumber: 1,
      totalEstimatedCostEuro: 8.5,
      meals: [
        {
          mealType: "dinner",
          recipeName: "Rice bowl",
          imageUrl: "",
          ingredients: [
            {
              name: "rice",
              quantity: 100,
              unit: "g",
              category: "Pantry",
              estPriceEuro: 0.4,
            },
          ],
          shortSummary: "Simple rice bowl with pantry staples.",
          instructions: "Cook and serve.",
          cookTimeMinutes: 20,
        },
      ],
    },
  ],
} as const;

async function expectPlanError(
  promise: Promise<unknown>,
  reason: PlanGenerationReason,
  attempts?: number,
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected generateMealPlan to throw PlanGenerationError");
  } catch (err) {
    expect(err).toBeInstanceOf(PlanGenerationError);
    const planError = err as PlanGenerationError;
    expect(planError.reason).toBe(reason);
    expect(planError.code).toBe(reason);

    if (typeof attempts === "number") {
      expect(planError.attempts).toBe(attempts);
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  aiProviderMocks.getAiProvider.mockReturnValue("groq");
  feedbackExclusionMocks.getDislikedRecipes.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateMealPlan failure taxonomy", () => {
  it("passes dislikedRecipes and recentMealNames from generationContext to buildMealPlanPrompt", async () => {
    const dislikedRecipes = ["Pasta Carbonara", "Chicken Curry"];
    const recentMealNames = ["Rice Bowl", "Tomato Soup"];

    aiProviderMocks.createJsonCompletion.mockResolvedValue({
      content: JSON.stringify(validModelPlan),
    });

    await generateMealPlan({
      ...baseInput,
      generationContext: {
        dislikedRecipes,
        recentMealNames,
        profileSnapshot: {
          adults: 1,
          children: 0,
          toddlers: 0,
          dietTypes: [],
          allergens: [],
          dislikes: [],
          weeklyBudgetEuro: 0,
        },
      },
    });

    expect(promptBuilderMocks.buildMealPlanPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ dislikedRecipes, recentMealNames }),
    );
    expect(feedbackExclusionMocks.getDislikedRecipes).not.toHaveBeenCalled();
  });

  it("passes empty dislikedRecipes and recentMealNames when generationContext is not provided", async () => {
    aiProviderMocks.createJsonCompletion.mockResolvedValue({
      content: JSON.stringify(validModelPlan),
    });

    await generateMealPlan({
      ...baseInput,
    });

    expect(promptBuilderMocks.buildMealPlanPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        dislikedRecipes: [],
        recentMealNames: [],
      }),
    );
    expect(feedbackExclusionMocks.getDislikedRecipes).not.toHaveBeenCalled();
  });

  it("tolerates missing pricing fields by normalizing estimates instead of failing", async () => {
    aiProviderMocks.createJsonCompletion.mockResolvedValue({
      content: JSON.stringify({
        days: [
          {
            dayNumber: 1,
            meals: [
              {
                mealType: "dinner",
                recipeName: "Rice bowl",
                imageUrl: "",
                ingredients: [
                  {
                    name: "rice",
                    quantity: 100,
                    unit: "g",
                    category: "Pantry",
                  },
                ],
                shortSummary: "Simple rice bowl with pantry staples.",
                instructions: "Cook and serve.",
                cookTimeMinutes: 20,
              },
            ],
          },
        ],
      }),
    });

    const plan = await generateMealPlan(baseInput);

    expect(plan.days[0]?.totalEstimatedCostEuro).toBeGreaterThan(0);
    expect(plan.days[0]?.meals[0]?.ingredients[0]?.estPriceEuro).toBeGreaterThan(0);
    expect(aiProviderMocks.createJsonCompletion).toHaveBeenCalledTimes(1);
  });

  it("returns SCHEMA_VALIDATION_FAILURE when model JSON fails schema validation", async () => {
    aiProviderMocks.createJsonCompletion.mockResolvedValue({
      content: JSON.stringify({
        days: [
          {
            dayNumber: 1,
            totalEstimatedCostEuro: 10,
            meals: [{ mealType: "dinner" }],
          },
        ],
      }),
    });

    await expectPlanError(
      generateMealPlan(baseInput),
      PLAN_GENERATION_REASONS.SCHEMA_VALIDATION_FAILURE,
      3,
    );

    expect(aiProviderMocks.createJsonCompletion).toHaveBeenCalledTimes(3);
  });

  it("returns ALLERGEN_VIOLATION and retries up to 3 attempts", async () => {
    aiProviderMocks.createJsonCompletion.mockResolvedValue({
      content: JSON.stringify({
        ...validModelPlan,
        days: [
          {
            ...validModelPlan.days[0],
            meals: [
              {
                ...validModelPlan.days[0].meals[0],
                ingredients: [
                  {
                    name: "peanut oil",
                    quantity: 1,
                    unit: "tbsp",
                    category: "Pantry",
                    estPriceEuro: 0.5,
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    await expectPlanError(
      generateMealPlan({ ...baseInput, allergens: ["peanuts"] }),
      PLAN_GENERATION_REASONS.ALLERGEN_VIOLATION,
      3,
    );

    expect(aiProviderMocks.createJsonCompletion).toHaveBeenCalledTimes(3);
  });

  it("returns EMPTY_OR_TRUNCATED_RESPONSE for repeated empty responses", async () => {
    aiProviderMocks.createJsonCompletion.mockResolvedValue({
      content: "   ",
    });

    await expectPlanError(
      generateMealPlan(baseInput),
      PLAN_GENERATION_REASONS.EMPTY_OR_TRUNCATED_RESPONSE,
      3,
    );

    expect(aiProviderMocks.createJsonCompletion).toHaveBeenCalledTimes(3);
  });

  it("returns TOKEN_LIMIT_EXCEEDED when provider flags truncation", async () => {
    aiProviderMocks.createJsonCompletion.mockResolvedValue({
      content: JSON.stringify(validModelPlan),
      metadata: {
        isTruncated: true,
      },
    });

    await expectPlanError(
      generateMealPlan(baseInput),
      PLAN_GENERATION_REASONS.TOKEN_LIMIT_EXCEEDED,
    );

    expect(aiProviderMocks.createJsonCompletion).toHaveBeenCalledTimes(1);
  });

  it("returns CONSTRAINT_CONFLICT for contradictory diet constraints without calling provider", async () => {
    await expectPlanError(
      generateMealPlan({ ...baseInput, dietTypes: ["vegan", "keto"] }),
      PLAN_GENERATION_REASONS.CONSTRAINT_CONFLICT,
      1,
    );

    expect(aiProviderMocks.createJsonCompletion).not.toHaveBeenCalled();
  });
});