/**
 * Tests for the meals tRPC router.
 * 
 * Mocks:
 *  - next/headers   – unavailable in Node/vitest environment
 *  - ~/server/db    – avoids Neon connection; exposes vi.fn() hooks
 *  - ~/server/auth  – avoids NextAuth session resolution
 *  - ~/server/services/generation-orchestrator.service – detached generation
 *  - ~/server/ai/feedback-exclusions    – avoids extra select-chain mocking
 *  - ~/server/services/ai-provider.service - lazy instruction generation
 *  - ~/server/services/recipe-simplifier.service - simplification behavior
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

// ---------------------------------------------------------------------------
// 1. Hoisted mock functions — must be created before vi.mock() factories run.
// ---------------------------------------------------------------------------

const dbMocks = vi.hoisted(() => ({
  findFirstProfile: vi.fn(),
  findFirstMeal: vi.fn(),
  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
  selectFrom: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  updateWhere: vi.fn(),
  updateSet: vi.fn(),
  update: vi.fn(),
  txUpdateWhere: vi.fn(),
  txUpdateSet: vi.fn(),
  txUpdate: vi.fn(),
  txInsert: vi.fn(),
  txInsertPlanValues: vi.fn(),
  txInsertPlanReturning: vi.fn(),
  txInsertDaysValues: vi.fn(),
}));

const generationMocks = vi.hoisted(() => ({
  runGenerationOrchestrator: vi.fn(),
}));

const feedbackExclusionMocks = vi.hoisted(() => ({
  getDislikedRecipes: vi.fn(),
  getRecentMealNames: vi.fn(),
}));

const simplifierMocks = vi.hoisted(() => ({
  simplifyRecipeSteps: vi.fn(),
}));

const aiProviderMocks = vi.hoisted(() => ({
  createJsonCompletion: vi.fn(),
}));

// ---------------------------------------------------------------------------
// 2. Module mocks (hoisted to top of file by Vitest automatically).
// ---------------------------------------------------------------------------

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
  cookies: () => ({ get: () => null, getAll: () => [] }),
}));

vi.mock("~/server/db", () => ({
  db: {
    query: {
      profiles: { findFirst: dbMocks.findFirstProfile },
      meals: { findFirst: dbMocks.findFirstMeal },
    },
    select: dbMocks.select,
    update: dbMocks.update,
    transaction: dbMocks.transaction,
  },
}));

vi.mock("~/server/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

vi.mock("~/server/services/generation-orchestrator.service", () => ({
  runGenerationOrchestrator: generationMocks.runGenerationOrchestrator,
}));

vi.mock("~/server/ai/feedback-exclusions", () => ({
  getDislikedRecipes: feedbackExclusionMocks.getDislikedRecipes,
  getRecentMealNames: feedbackExclusionMocks.getRecentMealNames,
}));

vi.mock("~/server/services/recipe-simplifier.service", () => ({
  simplifyRecipeSteps: simplifierMocks.simplifyRecipeSteps,
}));

vi.mock("~/server/services/ai-provider.service", () => ({
  createJsonCompletion: aiProviderMocks.createJsonCompletion,
}));

// ---------------------------------------------------------------------------
// 3. Imports (placed after vi.mock calls — mocks are already hoisted).
// ---------------------------------------------------------------------------

import { db } from "~/server/db";
import { createCallerFactory } from "~/server/api/trpc";
import { mealsRouter } from "~/server/api/routers/meals";
import { INSTRUCTIONS_PLACEHOLDER } from "~/server/ai/types";
import { mockSession } from "../../helpers/mock-session";

// ---------------------------------------------------------------------------
// 4. Caller factory helpers
// ---------------------------------------------------------------------------

const makeCallerFactory = createCallerFactory(mealsRouter);

function authedCaller(userId = "user-1") {
  return makeCallerFactory({
    db: db as any,
    session: mockSession(userId),
    headers: new Headers(),
  } as any);
}

function unauthedCaller() {
  return makeCallerFactory({
    db: db as any,
    session: null,
    headers: new Headers(),
  } as any);
}

// ---------------------------------------------------------------------------
// 5. Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_PLAN_ID = "plan-abc";

const mockProfile = {
  id: "profile-1",
  userId: "user-1",
  adults: 2,
  children: 1,
  toddlers: 1,
  dietTypes: ["vegetarian"],
  allergens: ["peanuts"],
  dislikes: ["cilantro"],
  weeklyBudgetEuro: 100,
  portionMultipliers: null,
  updatedAt: new Date(),
};

const mockMeal = {
  id: "meal-1",
  dayId: "day-1",
  mealType: "dinner" as const,
  recipeName: "Test Pasta",
  imageUrl: null,
  ingredients: JSON.stringify([]),
  instructions: "Cook the pasta.",
  mealHash: null,
  cookTimeMinutes: 30,
  day: {
    id: "day-1",
    planId: "plan-1",
    dayNumber: 1,
    plan: {
      id: "plan-1",
      userId: "user-1",
      planDays: 7,
      isActive: true,
      createdAt: new Date(),
    },
  },
};

// ---------------------------------------------------------------------------
// 6. beforeEach — reset all mocks and set safe defaults
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  dbMocks.selectLimit.mockResolvedValue([]);
  dbMocks.selectWhere.mockReturnValue({ limit: dbMocks.selectLimit });
  dbMocks.selectFrom.mockReturnValue({ where: dbMocks.selectWhere });
  dbMocks.select.mockReturnValue({ from: dbMocks.selectFrom });

  dbMocks.updateWhere.mockResolvedValue(undefined);
  dbMocks.updateSet.mockReturnValue({ where: dbMocks.updateWhere });
  dbMocks.update.mockReturnValue({ set: dbMocks.updateSet });

  dbMocks.txUpdateWhere.mockResolvedValue(undefined);
  dbMocks.txUpdateSet.mockReturnValue({ where: dbMocks.txUpdateWhere });
  dbMocks.txUpdate.mockReturnValue({ set: dbMocks.txUpdateSet });

  dbMocks.txInsertPlanReturning.mockResolvedValue([{ id: MOCK_PLAN_ID }]);
  dbMocks.txInsertPlanValues.mockReturnValue({
    returning: dbMocks.txInsertPlanReturning,
  });
  dbMocks.txInsertDaysValues.mockResolvedValue(undefined);

  dbMocks.txInsert
    .mockReturnValueOnce({ values: dbMocks.txInsertPlanValues })
    .mockReturnValueOnce({ values: dbMocks.txInsertDaysValues });

  // Default: transaction runs its callback and returns the result
  dbMocks.transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        update: dbMocks.txUpdate,
        insert: dbMocks.txInsert,
      }),
  );

  generationMocks.runGenerationOrchestrator.mockResolvedValue({
    status: "completed",
    succeededDays: [1],
    failedDays: [],
    outcomes: [],
  });

  feedbackExclusionMocks.getDislikedRecipes.mockResolvedValue([]);
  feedbackExclusionMocks.getRecentMealNames.mockResolvedValue([]);

  simplifierMocks.simplifyRecipeSteps.mockResolvedValue({
    instructions: "1. Simplified prep. 2. Serve.",
    cookTimeMinutes: 15,
    simplificationNotes: "Reduced active prep by batching steps.",
  });

  aiProviderMocks.createJsonCompletion.mockResolvedValue({
    content: '{"instructions":"1. Boil pasta. 2. Finish and serve."}',
  });
});

// ---------------------------------------------------------------------------
// 7. meals.getRecipeDetail
// ---------------------------------------------------------------------------

describe("meals.getRecipeDetail", () => {
  it("throws NOT_FOUND when the meal does not exist", async () => {
    dbMocks.findFirstMeal.mockResolvedValue(undefined);

    await expect(
      authedCaller().getRecipeDetail({ mealId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws FORBIDDEN when the meal belongs to a different user", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      instructions: INSTRUCTIONS_PLACEHOLDER,
      day: { ...mockMeal.day, plan: { ...mockMeal.day.plan, userId: "user-2" } },
    });

    await expect(
      authedCaller("user-1").getRecipeDetail({ mealId: "meal-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns stored instructions without generating when already present", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      instructions: "1. Existing step.",
    });

    const result = await authedCaller().getRecipeDetail({ mealId: "meal-1" });

    expect(result).toEqual({
      mealId: "meal-1",
      recipeName: "Test Pasta",
      instructions: "1. Existing step.",
    });
    expect(aiProviderMocks.createJsonCompletion).not.toHaveBeenCalled();
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it("reuses instructions from a matching meal hash without calling AI", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      ingredients: [{ name: "Pasta", quantity: 200, unit: "g" }],
      mealHash: "shared-meal-hash",
      instructions: INSTRUCTIONS_PLACEHOLDER,
    });
    dbMocks.selectLimit.mockResolvedValue([
      { instructions: "1. Reused step. 2. Serve warm." },
    ]);

    const result = await authedCaller().getRecipeDetail({ mealId: "meal-1" });

    expect(result).toEqual({
      mealId: "meal-1",
      recipeName: "Test Pasta",
      instructions: "1. Reused step. 2. Serve warm.",
    });
    expect(aiProviderMocks.createJsonCompletion).not.toHaveBeenCalled();
    expect(dbMocks.updateSet).toHaveBeenCalledWith({
      instructions: "1. Reused step. 2. Serve warm.",
      mealHash: "shared-meal-hash",
    });
  });

  it("calls AI on hash miss and persists generated instructions with computed mealHash", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      ingredients: [{ name: "Pasta", quantity: 200, unit: "g" }],
      mealHash: null,
      instructions: INSTRUCTIONS_PLACEHOLDER,
    });
    dbMocks.selectLimit.mockResolvedValue([]);

    const result = await authedCaller().getRecipeDetail({ mealId: "meal-1" });

    expect(result).toEqual({
      mealId: "meal-1",
      recipeName: "Test Pasta",
      instructions: "1. Boil pasta. 2. Finish and serve.",
    });
    expect(aiProviderMocks.createJsonCompletion).toHaveBeenCalledOnce();
    expect(dbMocks.update).toHaveBeenCalledOnce();
    expect(dbMocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "1. Boil pasta. 2. Finish and serve.",
        mealHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("uses cached instructions on second open without calling AI again", async () => {
    dbMocks.findFirstMeal
      .mockResolvedValueOnce({
        ...mockMeal,
        ingredients: [{ name: "Pasta", quantity: 200, unit: "g" }],
        instructions: INSTRUCTIONS_PLACEHOLDER,
      })
      .mockResolvedValueOnce({
        ...mockMeal,
        instructions: "1. Boil pasta. 2. Finish and serve.",
      });

    const caller = authedCaller();

    const firstOpen = await caller.getRecipeDetail({ mealId: "meal-1" });
    const secondOpen = await caller.getRecipeDetail({ mealId: "meal-1" });

    expect(firstOpen.instructions).toBe("1. Boil pasta. 2. Finish and serve.");
    expect(secondOpen.instructions).toBe("1. Boil pasta. 2. Finish and serve.");
    expect(aiProviderMocks.createJsonCompletion).toHaveBeenCalledTimes(1);
    expect(dbMocks.update).toHaveBeenCalledTimes(1);
  });

  it("throws INTERNAL_SERVER_ERROR when generation returns invalid JSON", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      instructions: null,
    });
    aiProviderMocks.createJsonCompletion.mockResolvedValue({
      content: "not-json",
    });

    await expect(
      authedCaller().getRecipeDetail({ mealId: "meal-1" }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to generate recipe instructions. Please try again.",
    });
  });

  it("throws UNAUTHORIZED when no session is present", async () => {
    await expect(
      unauthedCaller().getRecipeDetail({ mealId: "meal-1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(dbMocks.findFirstMeal).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 8. meals.getById
// ---------------------------------------------------------------------------

describe("meals.getById", () => {
  it("returns null when the meal does not exist", async () => {
    dbMocks.findFirstMeal.mockResolvedValue(undefined);
    const result = await authedCaller().getById({ id: "non-existent" });
    expect(result).toBeNull();
  });

  it("returns the meal when it belongs to the authenticated user", async () => {
    dbMocks.findFirstMeal.mockResolvedValue(mockMeal);
    const result = await authedCaller("user-1").getById({ id: "meal-1" });
    expect(result).toMatchObject({ id: "meal-1", recipeName: "Test Pasta" });
  });

  it("throws FORBIDDEN when the meal belongs to a different user", async () => {
    const mealOwnedByOther = {
      ...mockMeal,
      day: { ...mockMeal.day, plan: { ...mockMeal.day.plan, userId: "user-2" } },
    };
    dbMocks.findFirstMeal.mockResolvedValue(mealOwnedByOther);

    await expect(
      authedCaller("user-1").getById({ id: "meal-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN for meals with no plan (incomplete join)", async () => {
    const mealWithoutPlan = { ...mockMeal, day: undefined };
    dbMocks.findFirstMeal.mockResolvedValue(mealWithoutPlan);

    await expect(
      authedCaller("user-1").getById({ id: "meal-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws UNAUTHORIZED when no session is present", async () => {
    await expect(
      unauthedCaller().getById({ id: "meal-1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    // The DB should never be reached
    expect(dbMocks.findFirstMeal).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 9. meals.simplifyRecipe
// ---------------------------------------------------------------------------

describe("meals.simplifyRecipe", () => {
  it("throws UNAUTHORIZED when no session is present", async () => {
    await expect(
      unauthedCaller().simplifyRecipe({ mealId: "meal-1", maxCookTimeMinutes: 20 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(dbMocks.findFirstMeal).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the meal does not exist", async () => {
    dbMocks.findFirstMeal.mockResolvedValue(undefined);

    await expect(
      authedCaller().simplifyRecipe({ mealId: "missing", maxCookTimeMinutes: 20 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws FORBIDDEN when the meal belongs to a different user", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      day: { ...mockMeal.day, plan: { ...mockMeal.day.plan, userId: "user-2" } },
    });

    await expect(
      authedCaller().simplifyRecipe({ mealId: "meal-1", maxCookTimeMinutes: 20 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("generates instructions lazily and returns alreadyFast when under target", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      cookTimeMinutes: 20,
      instructions: null,
    });

    const result = await authedCaller().simplifyRecipe({
      mealId: "meal-1",
      maxCookTimeMinutes: 25,
    });

    expect(result).toMatchObject({
      mealId: "meal-1",
      instructions: "1. Boil pasta. 2. Finish and serve.",
      cookTimeMinutes: 20,
      alreadyFast: true,
    });
    expect(simplifierMocks.simplifyRecipeSteps).not.toHaveBeenCalled();
    expect(dbMocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "1. Boil pasta. 2. Finish and serve.",
        mealHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("generates then simplifies when instructions are null and cook time is above target", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      cookTimeMinutes: 45,
      instructions: null,
    });

    const result = await authedCaller().simplifyRecipe({
      mealId: "meal-1",
      maxCookTimeMinutes: 20,
    });

    expect(simplifierMocks.simplifyRecipeSteps).toHaveBeenCalledWith(
      {
        recipeName: "Test Pasta",
        instructions: "1. Boil pasta. 2. Finish and serve.",
        cookTimeMinutes: 45,
      },
      20,
    );
    expect(result).toMatchObject({
      mealId: "meal-1",
      instructions: "1. Simplified prep. 2. Serve.",
      cookTimeMinutes: 15,
      simplificationNotes: "Reduced active prep by batching steps.",
      alreadyFast: false,
    });
    expect(dbMocks.update).toHaveBeenCalledTimes(2);
  });

  it("throws INTERNAL_SERVER_ERROR when lazy instruction generation fails", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      instructions: null,
    });
    aiProviderMocks.createJsonCompletion.mockResolvedValue({
      content: "{",
    });

    await expect(
      authedCaller().simplifyRecipe({ mealId: "meal-1", maxCookTimeMinutes: 20 }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Recipe instructions are unavailable and could not be generated for simplification.",
    });
  });
});

// ---------------------------------------------------------------------------
// 10. meals.estimatedCost
// ---------------------------------------------------------------------------

describe("meals.estimatedCost", () => {
  it("throws UNAUTHORIZED when no session is present", async () => {
    await expect(
      unauthedCaller().estimatedCost({ mealId: "meal-1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(dbMocks.findFirstMeal).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the meal does not exist", async () => {
    dbMocks.findFirstMeal.mockResolvedValue(undefined);

    await expect(
      authedCaller().estimatedCost({ mealId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws FORBIDDEN when the meal belongs to a different user", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      day: { ...mockMeal.day, plan: { ...mockMeal.day.plan, userId: "user-2" } },
    });

    await expect(
      authedCaller("user-1").estimatedCost({ mealId: "meal-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns null when meal has no ingredients", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      ingredients: JSON.stringify([]),
    });

    const result = await authedCaller().estimatedCost({ mealId: "meal-1" });

    expect(result).toBeNull();
  });

  it("returns null when all ingredients are unknown (0 total)", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      ingredients: JSON.stringify([
        { name: "unobtanium", quantity: 100, unit: "g" },
        { name: "mysteryHerb", quantity: 50, unit: "g" },
      ]),
    });

    const result = await authedCaller().estimatedCost({ mealId: "meal-1" });

    expect(result).toBeNull();
  });

  it("returns estimated cost for meal with known ingredients", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      ingredients: JSON.stringify([
        { name: "chicken breast", quantity: 1, unit: "kg" },
        { name: "onion", quantity: 2, unit: "kg" },
      ]),
    });

    const result = await authedCaller().estimatedCost({ mealId: "meal-1" });

    // chicken breast: 5.49 * 1 = 5.49
    // onion: 0.99 * 2 = 1.98
    // Total: 5.49 + 1.98 = 7.47
    expect(result).toBeCloseTo(7.47, 2);
  });

  it("skips unknown ingredients and returns cost for known ones", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      ingredients: JSON.stringify([
        { name: "onion", quantity: 1, unit: "kg" },
        { name: "unobtanium", quantity: 5, unit: "kg" },
        { name: "chicken breast", quantity: 0.5, unit: "kg" },
      ]),
    });

    const result = await authedCaller().estimatedCost({ mealId: "meal-1" });

    // onion: 0.99 * 1 = 0.99
    // unobtanium: skipped
    // chicken breast: 5.49 * 0.5 = 2.745
    // Total: 0.99 + 2.745 = 3.735
    expect(result).toBeCloseTo(3.735, 2);
  });

  it("handles partial ingredient name match in dataset", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      ingredients: JSON.stringify([
        { name: "boneless chicken breast fillet", quantity: 1, unit: "kg" },
      ]),
    });

    const result = await authedCaller().estimatedCost({ mealId: "meal-1" });

    // Partial match to "chicken breast": 5.49 * 1 = 5.49
    expect(result).toBeCloseTo(5.49, 2);
  });

  it("handles items with zero or negative quantity", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      ingredients: JSON.stringify([
        { name: "chicken breast", quantity: 0, unit: "kg" },
        { name: "onion", quantity: -1, unit: "kg" },
      ]),
    });

    const result = await authedCaller().estimatedCost({ mealId: "meal-1" });

    // Both skipped due to invalid quantities
    expect(result).toBeNull();
  });

  it("case-insensitive ingredient matching", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      ingredients: JSON.stringify([
        { name: "CHICKEN BREAST", quantity: 1, unit: "kg" },
        { name: "OnIoN", quantity: 1, unit: "kg" },
      ]),
    });

    const result = await authedCaller().estimatedCost({ mealId: "meal-1" });

    // chicken breast: 5.49 * 1 = 5.49
    // onion: 0.99 * 1 = 0.99
    // Total: 6.48
    expect(result).toBeCloseTo(6.48, 2);
  });

  it("throws FORBIDDEN when meal has incomplete plan relationship", async () => {
    dbMocks.findFirstMeal.mockResolvedValue({
      ...mockMeal,
      day: undefined,
    });

    await expect(
      authedCaller("user-1").estimatedCost({ mealId: "meal-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ---------------------------------------------------------------------------
// 11. meals.generate (legacy alias)
// ---------------------------------------------------------------------------

describe("meals.generate (legacy alias)", () => {
  it("throws UNAUTHORIZED when no session is present", async () => {
    await expect(
      unauthedCaller().generate({ days: 3, mealsPerDay: "3" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(dbMocks.findFirstProfile).not.toHaveBeenCalled();
    expect(generationMocks.runGenerationOrchestrator).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the user has no profile", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(undefined);

    await expect(
      authedCaller().generate({ days: 3, mealsPerDay: "3" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(generationMocks.runGenerationOrchestrator).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST when portionMultipliers in profile are invalid", async () => {
    dbMocks.findFirstProfile.mockResolvedValue({
      ...mockProfile,
      // adult is negative — fails z.number().positive()
      portionMultipliers: { adult: -1, child: 0.75, toddler: 0.5 },
    });

    await expect(
      authedCaller().generate({ days: 1, mealsPerDay: "3" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(generationMocks.runGenerationOrchestrator).not.toHaveBeenCalled();
  });

  it("returns stream metadata immediately even if orchestration is still running", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);

    generationMocks.runGenerationOrchestrator.mockImplementation(
      async () => await new Promise(() => undefined),
    );

    const result = await authedCaller().generate({ days: 1, mealsPerDay: "3" });

    expect(result).toEqual({
      planId: MOCK_PLAN_ID,
      requestedDays: 1,
      streamUrl: `/api/generation/stream?planId=${MOCK_PLAN_ID}`,
    });
  });

  it("passes household and constraints into the detached orchestrator", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile); // adults:2, children:1, toddlers:1

    await authedCaller().generate({ days: 1, mealsPerDay: "3" });

    expect(generationMocks.runGenerationOrchestrator).toHaveBeenCalledOnce();
    expect(generationMocks.runGenerationOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        planId: MOCK_PLAN_ID,
        household: { adults: 2, children: 1, toddlers: 1 },
        allergens: ["peanuts"],
        dietTypes: ["vegetarian"],
        dislikes: ["cilantro"],
        weeklyBudgetEuro: 100,
        planDays: 1,
        portionMultipliers: null, // profile has null → passed through
      }),
    );
  });

  it("passes validated custom portionMultipliers from the profile", async () => {
    dbMocks.findFirstProfile.mockResolvedValue({
      ...mockProfile,
      portionMultipliers: { adult: 1.5, child: 1.0, toddler: 0.75 },
    });

    await authedCaller().generate({ days: 1, mealsPerDay: "2" });

    expect(generationMocks.runGenerationOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        portionMultipliers: { adult: 1.5, child: 1.0, toddler: 0.75 },
      }),
    );
  });

  it("creates an active in-progress plan shell in a transaction", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);

    await authedCaller().generate({ days: 1, mealsPerDay: "3" });

    expect(dbMocks.transaction).toHaveBeenCalledOnce();
    expect(dbMocks.txInsertPlanValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        planDays: 1,
        generationStatus: "in_progress",
      }),
    );
  });

  it("builds the correct mealSelection from mealsPerDay input", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);

    await authedCaller().generate({ days: 2, mealsPerDay: "2" });

    expect(generationMocks.runGenerationOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        mealSelection: {
          "1": { breakfast: false, lunch: true, dinner: true },
          "2": { breakfast: false, lunch: true, dinner: true },
        },
      }),
    );
  });

  it("rejects invalid days input (< 1) at Zod validation boundary", async () => {
    await expect(
      authedCaller().generate({ days: 0, mealsPerDay: "3" }),
    ).rejects.toThrow();
  });

  it("rejects invalid days input (> 7) at Zod validation boundary", async () => {
    await expect(
      authedCaller().generate({ days: 8, mealsPerDay: "3" }),
    ).rejects.toThrow();
  });
});
