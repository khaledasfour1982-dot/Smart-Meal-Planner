import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  findFirstPlan: vi.fn(),
  findManyPlans: vi.fn(),
  findFirstProfile: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  select: vi.fn(),
  selectFrom: vi.fn(),
  selectWhere: vi.fn(),
  transaction: vi.fn(),
  txDeleteWhere: vi.fn(),
  txInsertValues: vi.fn(),
  txInsertReturning: vi.fn(),
  txUpdate: vi.fn(),
  txUpdateSet: vi.fn(),
  txUpdateWhere: vi.fn(),
}));

const aiMocks = vi.hoisted(() => ({
  generateMealPlan: vi.fn(),
}));

const feedbackExclusionMocks = vi.hoisted(() => ({
  getDislikedRecipes: vi.fn(),
  getRecentMealNames: vi.fn(),
}));

const generationMocks = vi.hoisted(() => ({
  createPlanShell: vi.fn(),
  startDetachedGeneration: vi.fn(),
}));

const pixabayMocks = vi.hoisted(() => ({
  fetchPixabayImage: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
  cookies: () => ({ get: () => null, getAll: () => [] }),
}));

vi.mock("~/server/db", () => ({
  db: {
    select: dbMocks.select,
    update: dbMocks.update,
    query: {
      plans: {
        findFirst: dbMocks.findFirstPlan,
        findMany: dbMocks.findManyPlans,
      },
      profiles: { findFirst: dbMocks.findFirstProfile },
    },
    transaction: dbMocks.transaction,
  },
}));

vi.mock("~/server/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

vi.mock("~/server/services/meal-generator.service", () => ({
  generateMealPlan: aiMocks.generateMealPlan,
}));

vi.mock("~/server/ai/feedback-exclusions", () => ({
  getDislikedRecipes: feedbackExclusionMocks.getDislikedRecipes,
  getRecentMealNames: feedbackExclusionMocks.getRecentMealNames,
}));

vi.mock("~/server/services/plan-generation.service", () => ({
  createPlanShell: generationMocks.createPlanShell,
  startDetachedGeneration: generationMocks.startDetachedGeneration,
}));

vi.mock("~/server/ai/pixabay-image", () => ({
  fetchPixabayImage: pixabayMocks.fetchPixabayImage,
}));

import { TRPCError } from "@trpc/server";
import { PlanGenerationError } from "~/server/ai/errors";
import { plansRouter } from "~/server/api/routers/plans";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";
import { mockSession } from "../../helpers/mock-session";

const makeCallerFactory = createCallerFactory(plansRouter);

function authedCaller(userId = "user-1") {
  return makeCallerFactory({
    db: db as unknown,
    session: mockSession(userId),
    headers: new Headers(),
  } as Parameters<typeof makeCallerFactory>[0]);
}

function unauthedCaller() {
  return makeCallerFactory({
    db: db as unknown,
    session: null,
    headers: new Headers(),
  } as Parameters<typeof makeCallerFactory>[0]);
}

type MockIngredient = {
  name: string;
};

type MockMeal = {
  id: string;
  dayId: string;
  mealType: "breakfast" | "lunch" | "dinner";
  recipeName: string;
  imageUrl: string | null;
  ingredients: MockIngredient[];
  instructions: string;
  cookTimeMinutes: number;
};

type MockDay = {
  id: string;
  planId: string;
  dayNumber: number;
  meals: MockMeal[];
};

type MockPlan = {
  id: string;
  userId: string;
  planDays: number;
  generationStatus: "idle" | "in_progress" | "completed" | "partial_failure";
  startDate: Date;
  isActive: boolean;
  createdAt: Date;
  days: MockDay[];
};

const mockPlan: MockPlan = {
  id: "plan-1",
  userId: "user-1",
  planDays: 7,
  generationStatus: "completed",
  startDate: new Date("2026-03-10T00:00:00.000Z"),
  isActive: true,
  createdAt: new Date("2026-03-10T10:00:00.000Z"),
  days: [
    {
      id: "day-2",
      planId: "plan-1",
      dayNumber: 2,
      meals: [
        {
          id: "meal-2",
          dayId: "day-2",
          mealType: "dinner" as const,
          recipeName: "Pasta",
          imageUrl: null,
          ingredients: [],
          instructions: "Cook dinner",
          cookTimeMinutes: 25,
        },
        {
          id: "meal-1",
          dayId: "day-2",
          mealType: "breakfast" as const,
          recipeName: "Oatmeal",
          imageUrl: null,
          ingredients: [],
          instructions: "Cook oats",
          cookTimeMinutes: 10,
        },
      ],
    },
    {
      id: "day-1",
      planId: "plan-1",
      dayNumber: 1,
      meals: [
        {
          id: "meal-4",
          dayId: "day-1",
          mealType: "lunch" as const,
          recipeName: "Salad",
          imageUrl: null,
          ingredients: [],
          instructions: "Assemble lunch",
          cookTimeMinutes: 15,
        },
        {
          id: "meal-3",
          dayId: "day-1",
          mealType: "breakfast" as const,
          recipeName: "Toast",
          imageUrl: null,
          ingredients: [],
          instructions: "Toast bread",
          cookTimeMinutes: 5,
        },
      ],
    },
  ],
};

const mockProfile = {
  id: "profile-1",
  userId: "user-1",
  adults: 2,
  children: 1,
  toddlers: 0,
  dietTypes: ["vegetarian"],
  allergens: ["peanuts"],
  dislikes: ["mushroom"],
  weeklyBudgetEuro: 80,
  portionMultipliers: null,
  updatedAt: new Date(),
};

const singleMealPlan = {
  days: [
    {
      dayNumber: 1,
      totalEstimatedCostEuro: 12,
      meals: [
        {
          mealType: "dinner" as const,
          recipeName: "New Dinner",
          imageUrl: "",
          ingredients: [],
          instructions: "Cook",
          cookTimeMinutes: 20,
        },
      ],
    },
  ],
};

function makePlan(overrides: Partial<MockPlan> = {}): MockPlan {
  return {
    ...mockPlan,
    ...overrides,
    startDate: overrides.startDate ?? new Date(mockPlan.startDate),
    createdAt: overrides.createdAt ?? new Date(mockPlan.createdAt),
    days:
      overrides.days ??
      mockPlan.days.map((day) => ({
        ...day,
        meals: day.meals.map((meal) => ({
          ...meal,
          ingredients: Array.isArray(meal.ingredients)
            ? [...meal.ingredients]
            : meal.ingredients,
        })),
      })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pixabayMocks.fetchPixabayImage.mockResolvedValue(null);

  dbMocks.txDeleteWhere.mockResolvedValue(undefined);
  dbMocks.txInsertReturning.mockResolvedValue([{ id: "meal-new-1" }]);
  dbMocks.txInsertValues.mockReturnValue({
    returning: dbMocks.txInsertReturning,
  });
  dbMocks.txUpdateWhere.mockResolvedValue(undefined);
  dbMocks.txUpdateSet.mockReturnValue({
    where: dbMocks.txUpdateWhere,
  });
  dbMocks.txUpdate.mockReturnValue({
    set: dbMocks.txUpdateSet,
  });
  dbMocks.updateWhere.mockResolvedValue(undefined);
  dbMocks.updateSet.mockReturnValue({
    where: dbMocks.updateWhere,
  });
  dbMocks.update.mockReturnValue({
    set: dbMocks.updateSet,
  });

  dbMocks.selectWhere.mockResolvedValue([{ total: 0 }]);
  dbMocks.selectFrom.mockReturnValue({
    where: dbMocks.selectWhere,
  });
  dbMocks.select.mockReturnValue({
    from: dbMocks.selectFrom,
  });

  dbMocks.transaction.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        delete: () => ({ where: dbMocks.txDeleteWhere }),
        insert: () => ({ values: dbMocks.txInsertValues }),
        update: dbMocks.txUpdate,
      };
      return callback(tx);
    },
  );

  aiMocks.generateMealPlan.mockResolvedValue(singleMealPlan);
  feedbackExclusionMocks.getDislikedRecipes.mockResolvedValue([]);
  feedbackExclusionMocks.getRecentMealNames.mockResolvedValue([]);
  generationMocks.createPlanShell.mockResolvedValue("plan-2");
  generationMocks.startDetachedGeneration.mockImplementation(() => undefined);
});

describe("plans.getActivePlan", () => {
  it("throws UNAUTHORIZED when no session is present", async () => {
    await expect(unauthedCaller().getActivePlan()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    expect(dbMocks.findFirstPlan).not.toHaveBeenCalled();
  });

  it("returns null when the user has no plans", async () => {
    dbMocks.findFirstPlan
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await authedCaller().getActivePlan();

    expect(result).toBeNull();
    expect(dbMocks.findFirstPlan).toHaveBeenCalledTimes(2);
  });

  it("returns the most recent active plan when one exists", async () => {
    dbMocks.findFirstPlan.mockResolvedValueOnce(mockPlan);

    const result = await authedCaller().getActivePlan();

    expect(result).not.toBeNull();
    expect(result?.id).toBe("plan-1");
    expect(result?.generationStatus).toBe("completed");
    expect(dbMocks.findFirstPlan).toHaveBeenCalledTimes(1);
  });

  it("falls back to most recently created plan when no active plan exists", async () => {
    dbMocks.findFirstPlan
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ...mockPlan, isActive: false, id: "plan-2" });

    const result = await authedCaller().getActivePlan();

    expect(result?.id).toBe("plan-2");
    expect(result?.isActive).toBe(false);
    expect(dbMocks.findFirstPlan).toHaveBeenCalledTimes(2);
  });

  it("orders days ascending and meals as breakfast, lunch, dinner", async () => {
    dbMocks.findFirstPlan.mockResolvedValueOnce(mockPlan);

    const result = await authedCaller().getActivePlan();

    expect(result?.days.map((day) => day.dayNumber)).toEqual([1, 2]);
    expect(result?.days[0]?.meals.map((meal) => meal.mealType)).toEqual([
      "breakfast",
      "lunch",
    ]);
    expect(result?.days[1]?.meals.map((meal) => meal.mealType)).toEqual([
      "breakfast",
      "dinner",
    ]);
  });

  it("serializes startDate and createdAt to ISO strings", async () => {
    dbMocks.findFirstPlan.mockResolvedValueOnce(mockPlan);

    const result = await authedCaller().getActivePlan();

    expect(result?.startDate).toBe("2026-03-10T00:00:00.000Z");
    expect(result?.createdAt).toBe("2026-03-10T10:00:00.000Z");
  });

  it("falls back to createdAt when startDate is missing or invalid", async () => {
    dbMocks.findFirstPlan.mockResolvedValueOnce({
      ...mockPlan,
      startDate: undefined,
      createdAt: new Date("2026-03-11T09:30:00.000Z"),
    });

    const missingStartDateResult = await authedCaller().getActivePlan();
    expect(missingStartDateResult?.startDate).toBe("2026-03-11T09:30:00.000Z");

    dbMocks.findFirstPlan.mockResolvedValueOnce({
      ...mockPlan,
      startDate: new Date("invalid"),
      createdAt: new Date("2026-03-12T09:30:00.000Z"),
    });

    const invalidStartDateResult = await authedCaller().getActivePlan();
    expect(invalidStartDateResult?.startDate).toBe("2026-03-12T09:30:00.000Z");
  });
});

describe("plans.swapMeal", () => {
  it("throws UNAUTHORIZED when no session is present", async () => {
    await expect(
      unauthedCaller().swapMeal({ dayNumber: 1, mealType: "dinner" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws NOT_FOUND when no active plan exists", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);
    dbMocks.findFirstPlan.mockResolvedValue(undefined);

    await expect(
      authedCaller().swapMeal({ dayNumber: 1, mealType: "dinner" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST when the target meal slot does not exist on that day", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);
    dbMocks.findFirstPlan.mockResolvedValue({
      ...mockPlan,
      days: [
        {
          ...mockPlan.days[1],
          dayNumber: 1,
          meals: [
            {
              id: "meal-breakfast-only",
              dayId: "day-1",
              mealType: "breakfast",
              recipeName: "Toast",
              imageUrl: null,
              ingredients: [],
              instructions: "",
              cookTimeMinutes: 5,
            },
          ],
        },
      ],
    });

    await expect(
      authedCaller().swapMeal({ dayNumber: 1, mealType: "dinner" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("replaces exactly one targeted meal slot using one-day generation", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);
    dbMocks.findFirstPlan.mockResolvedValue(mockPlan);
    pixabayMocks.fetchPixabayImage.mockResolvedValue(
      "https://cdn.example.com/pasta.jpg",
    );

    const result = await authedCaller().swapMeal({
      dayNumber: 2,
      mealType: "dinner",
    });

    expect(aiMocks.generateMealPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        planDays: 1,
        mealSelection: {
          "1": { breakfast: false, lunch: false, dinner: true },
        },
        generationContext: expect.objectContaining({
          dislikedRecipes: [],
          recentMealNames: [],
        }),
      }),
    );
    expect(dbMocks.txDeleteWhere).toHaveBeenCalledOnce();
    expect(dbMocks.txInsertValues).toHaveBeenCalledOnce();
    expect(dbMocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://cdn.example.com/pasta.jpg",
      }),
    );
    expect(pixabayMocks.fetchPixabayImage).toHaveBeenCalledWith("New Dinner");
    expect(result).toMatchObject({
      success: true,
      planId: "plan-1",
      dayNumber: 2,
      mealType: "dinner",
    });
  });

  it("maps PlanGenerationError to INTERNAL_SERVER_ERROR", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);
    dbMocks.findFirstPlan.mockResolvedValue(mockPlan);
    aiMocks.generateMealPlan.mockRejectedValue(
      new PlanGenerationError("Cannot generate safe plan after 3 attempts.", 3),
    );

    const error = await authedCaller()
      .swapMeal({ dayNumber: 2, mealType: "dinner" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
  });
});

describe("plans.regenerateDay", () => {
  it("throws NOT_FOUND when target day is missing", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);
    dbMocks.findFirstPlan.mockResolvedValue(mockPlan);

    await expect(
      authedCaller().regenerateDay({ dayNumber: 7 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("replaces all meals for the targeted day only", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);
    dbMocks.findFirstPlan.mockResolvedValue(mockPlan);
    pixabayMocks.fetchPixabayImage
      .mockResolvedValueOnce("https://cdn.example.com/new-breakfast.jpg")
      .mockResolvedValueOnce("https://cdn.example.com/new-dinner.jpg");
    aiMocks.generateMealPlan.mockResolvedValue({
      days: [
        {
          dayNumber: 1,
          totalEstimatedCostEuro: 20,
          meals: [
            {
              mealType: "breakfast" as const,
              recipeName: "New Breakfast",
              imageUrl: "",
              ingredients: [],
              instructions: "Cook",
              cookTimeMinutes: 10,
            },
            {
              mealType: "dinner" as const,
              recipeName: "New Dinner",
              imageUrl: "",
              ingredients: [],
              instructions: "Cook",
              cookTimeMinutes: 20,
            },
          ],
        },
      ],
    });
    dbMocks.txInsertReturning.mockResolvedValue([{ id: "meal-a" }, { id: "meal-b" }]);

    const result = await authedCaller().regenerateDay({ dayNumber: 2 });

    expect(aiMocks.generateMealPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        planDays: 1,
        mealSelection: {
          "1": { breakfast: true, lunch: false, dinner: true },
        },
        generationContext: expect.objectContaining({
          dislikedRecipes: [],
          recentMealNames: [],
        }),
      }),
    );
    expect(dbMocks.txDeleteWhere).toHaveBeenCalledOnce();
    expect(dbMocks.txInsertValues).toHaveBeenCalledWith([
      expect.objectContaining({
        recipeName: "New Breakfast",
        imageUrl: "https://cdn.example.com/new-breakfast.jpg",
      }),
      expect.objectContaining({
        recipeName: "New Dinner",
        imageUrl: "https://cdn.example.com/new-dinner.jpg",
      }),
    ]);
    expect(pixabayMocks.fetchPixabayImage).toHaveBeenCalledTimes(2);
    expect(pixabayMocks.fetchPixabayImage).toHaveBeenNthCalledWith(
      1,
      "New Breakfast",
    );
    expect(pixabayMocks.fetchPixabayImage).toHaveBeenNthCalledWith(
      2,
      "New Dinner",
    );
    expect(result).toEqual({
      success: true,
      planId: "plan-1",
      dayNumber: 2,
      replacedMeals: 2,
    });
  });
});

describe("plans.regenerateFull", () => {
  it("returns stream metadata immediately after archiving and shell creation", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);
    dbMocks.findFirstPlan.mockResolvedValue(mockPlan);

    const result = await authedCaller().regenerateFull();

    expect(result).toEqual({
      planId: "plan-2",
      requestedDays: 7,
      streamUrl: "/api/generation/stream?planId=plan-2",
    });
    expect(dbMocks.updateSet).toHaveBeenCalledWith({ isActive: false });
    expect(generationMocks.createPlanShell).toHaveBeenCalledWith({
      db: db as unknown,
      userId: "user-1",
      planDays: 7,
      archiveExistingActive: false,
    });
    expect(generationMocks.startDetachedGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: "plan-2",
        userId: "user-1",
        planDays: 7,
      }),
    );
  });

  it("keeps legacy no-input behavior by reusing current day meal slots", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);
    dbMocks.findFirstPlan.mockResolvedValue(mockPlan);

    await authedCaller().regenerateFull();

    expect(generationMocks.startDetachedGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: "plan-2",
        userId: "user-1",
        planDays: 7,
        mealSelection: {
          "1": { breakfast: true, lunch: true, dinner: false },
          "2": { breakfast: true, lunch: false, dinner: true },
        },
      }),
    );
  });

  it("honors planDays override and builds selection for all requested days", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);
    dbMocks.findFirstPlan.mockResolvedValue(mockPlan);

    await authedCaller().regenerateFull({ planDays: 3 });

    expect(generationMocks.startDetachedGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        planDays: 3,
        mealSelection: {
          "1": { breakfast: true, lunch: true, dinner: false },
          "2": { breakfast: true, lunch: false, dinner: true },
          "3": { breakfast: true, lunch: true, dinner: true },
        },
      }),
    );
  });

  it("honors mealsPerDay override when explicit mealSelection is not provided", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);
    dbMocks.findFirstPlan.mockResolvedValue(mockPlan);

    await authedCaller().regenerateFull({ planDays: 2, mealsPerDay: 1 });

    expect(generationMocks.startDetachedGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        planDays: 2,
        mealSelection: {
          "1": { breakfast: true, lunch: false, dinner: false },
          "2": { breakfast: true, lunch: false, dinner: false },
        },
      }),
    );
  });

  it("uses explicit mealSelection over mealsPerDay defaults for matching day keys", async () => {
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);
    dbMocks.findFirstPlan.mockResolvedValue(mockPlan);

    await authedCaller().regenerateFull({
      planDays: 2,
      mealsPerDay: 3,
      mealSelection: {
        "1": { breakfast: false, lunch: true, dinner: false },
      },
    });

    expect(generationMocks.startDetachedGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        planDays: 2,
        mealSelection: {
          "1": { breakfast: false, lunch: true, dinner: false },
          "2": { breakfast: true, lunch: true, dinner: true },
        },
      }),
    );
  });

});

describe("plans.getHistory", () => {
  it("queries only inactive plans for the current user, newest-first, and respects limit", async () => {
    const newestInactivePlan = makePlan({
      id: "plan-history-2",
      isActive: false,
      createdAt: new Date("2026-03-12T10:00:00.000Z"),
      startDate: new Date("2026-03-12T00:00:00.000Z"),
    });
    const olderInactivePlan = makePlan({
      id: "plan-history-1",
      isActive: false,
      createdAt: new Date("2026-03-08T10:00:00.000Z"),
      startDate: new Date("2026-03-08T00:00:00.000Z"),
    });

    dbMocks.findManyPlans.mockResolvedValue([newestInactivePlan, olderInactivePlan]);
    dbMocks.selectWhere.mockResolvedValue([{ total: 2 }]);

    const result = await authedCaller().getHistory({ limit: 2, offset: 0 });

    expect(result).toEqual({
      plans: [
        {
          id: "plan-history-2",
          planDays: 7,
          startDate: "2026-03-12T00:00:00.000Z",
          createdAt: "2026-03-12T10:00:00.000Z",
          mealCount: 4,
        },
        {
          id: "plan-history-1",
          planDays: 7,
          startDate: "2026-03-08T00:00:00.000Z",
          createdAt: "2026-03-08T10:00:00.000Z",
          mealCount: 4,
        },
      ],
      total: 2,
    });

    expect(dbMocks.findManyPlans).toHaveBeenCalledOnce();

    const query = dbMocks.findManyPlans.mock.calls[0]?.[0];
    const eq = vi.fn((field: string, value: unknown) => ({ field, value }));
    const and = vi.fn((...conditions: unknown[]) => conditions);
    const desc = vi.fn((field: string) => `desc:${field}`);

    expect(query.where({ userId: "plans.userId", isActive: "plans.isActive" }, { and, eq })).toEqual([
      { field: "plans.userId", value: "user-1" },
      { field: "plans.isActive", value: false },
    ]);
    expect(query.orderBy({ createdAt: "plans.createdAt" }, { desc })).toEqual([
      "desc:plans.createdAt",
    ]);
    expect(query.limit).toBe(2);
    expect(query.offset).toBe(0);
  });

  it("returns an empty list when the user has no inactive plans", async () => {
    dbMocks.findManyPlans.mockResolvedValue([]);
    dbMocks.selectWhere.mockResolvedValue([{ total: 0 }]);

    const result = await authedCaller().getHistory({ limit: 10, offset: 0 });

    expect(result).toEqual({ plans: [], total: 0 });
  });
});

describe("plans.restorePlan", () => {
  it("restores an inactive plan through the transaction path and archives the previously active plan", async () => {
    const currentActivePlan = makePlan({
      id: "plan-current",
      isActive: true,
      createdAt: new Date("2026-03-15T10:00:00.000Z"),
    });
    const archivedPlan = makePlan({
      id: "plan-archived",
      isActive: false,
      createdAt: new Date("2026-03-11T10:00:00.000Z"),
      days: [
        {
          id: "day-restore-1",
          planId: "plan-archived",
          dayNumber: 1,
          meals: [
            {
              id: "meal-restore-1",
              dayId: "day-restore-1",
              mealType: "dinner",
              recipeName: "Tomato Pasta",
              imageUrl: null,
              ingredients: [{ name: "tomatoes" }, { name: "basil" }] as Array<{
                name: string;
              }>,
              instructions: "Cook pasta",
              cookTimeMinutes: 20,
            },
          ],
        },
      ],
    });
    const planState = [currentActivePlan, archivedPlan];

    dbMocks.findFirstPlan.mockResolvedValueOnce(archivedPlan);
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);
    dbMocks.selectWhere.mockImplementation(async () => [
      {
        total: planState.filter((plan) => plan.userId === "user-1" && !plan.isActive)
          .length,
      },
    ]);
    dbMocks.findManyPlans.mockImplementation(async ({ limit }: { limit: number }) =>
      planState
        .filter((plan) => plan.userId === "user-1" && !plan.isActive)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, limit),
    );

    let updateCallCount = 0;
    dbMocks.txUpdateWhere.mockImplementation(async () => {
      updateCallCount += 1;

      if (updateCallCount === 1) {
        for (const plan of planState) {
          if (plan.userId === "user-1" && plan.isActive) {
            plan.isActive = false;
          }
        }
        return;
      }

      const targetPlan = planState.find((plan) => plan.id === "plan-archived");
      if (targetPlan) {
        targetPlan.isActive = true;
      }
    });

    const restoreResult = await authedCaller().restorePlan({
      planId: "plan-archived",
      acknowledgedAllergenRisk: false,
    });

    expect(restoreResult).toEqual({ success: true, planId: "plan-archived" });
    expect(dbMocks.transaction).toHaveBeenCalledOnce();
    expect(dbMocks.txUpdate).toHaveBeenCalledTimes(2);
    expect(dbMocks.txUpdateSet).toHaveBeenNthCalledWith(1, { isActive: false });
    expect(dbMocks.txUpdateSet).toHaveBeenNthCalledWith(2, { isActive: true });
    expect(currentActivePlan.isActive).toBe(false);
    expect(archivedPlan.isActive).toBe(true);

    const historyAfterRestore = await authedCaller().getHistory({ limit: 10, offset: 0 });

    expect(historyAfterRestore.plans.map((plan: any) => plan.id)).toEqual(["plan-current"]);
  });

  it("returns success without writes when the requested plan is already active", async () => {
    dbMocks.findFirstPlan.mockResolvedValueOnce(
      makePlan({ id: "plan-active", isActive: true }),
    );

    const result = await authedCaller().restorePlan({
      planId: "plan-active",
      acknowledgedAllergenRisk: false,
    });

    expect(result).toEqual({ success: true, planId: "plan-active" });
    expect(dbMocks.findFirstProfile).not.toHaveBeenCalled();
    expect(dbMocks.transaction).not.toHaveBeenCalled();
    expect(dbMocks.txUpdate).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the requested plan id does not exist", async () => {
    dbMocks.findFirstPlan.mockResolvedValueOnce(undefined);

    await expect(
      authedCaller().restorePlan({
        planId: "missing-plan",
        acknowledgedAllergenRisk: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(dbMocks.findFirstProfile).not.toHaveBeenCalled();
    expect(dbMocks.transaction).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for another user's plan id and queries by id plus user id together", async () => {
    dbMocks.findFirstPlan.mockImplementationOnce(async (query) => {
      const eq = vi.fn((field: string, value: unknown) => ({ field, value }));
      const and = vi.fn((...conditions: unknown[]) => conditions);

      expect(query.where({ id: "plans.id", userId: "plans.userId" }, { and, eq })).toEqual([
        { field: "plans.id", value: "other-user-plan" },
        { field: "plans.userId", value: "user-1" },
      ]);

      return undefined;
    });

    await expect(
      authedCaller().restorePlan({
        planId: "other-user-plan",
        acknowledgedAllergenRisk: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(dbMocks.findFirstProfile).not.toHaveBeenCalled();
    expect(dbMocks.transaction).not.toHaveBeenCalled();
  });

  it("returns allergen confirmation details and performs no writes when risk is not acknowledged", async () => {
    dbMocks.findFirstPlan.mockResolvedValueOnce(
      makePlan({
        id: "plan-conflict",
        isActive: false,
        days: [
          {
            id: "day-conflict-1",
            planId: "plan-conflict",
            dayNumber: 1,
            meals: [
              {
                id: "meal-conflict-1",
                dayId: "day-conflict-1",
                mealType: "lunch",
                recipeName: "Peanut Curry",
                imageUrl: null,
                ingredients: [{ name: "peanuts" }] as Array<{ name: string }>,
                instructions: "Cook curry",
                cookTimeMinutes: 25,
              },
              {
                id: "meal-conflict-2",
                dayId: "day-conflict-1",
                mealType: "dinner",
                recipeName: "Satay Noodles",
                imageUrl: null,
                ingredients: [{ name: "arachis oil" }] as Array<{ name: string }>,
                instructions: "Cook noodles",
                cookTimeMinutes: 20,
              },
            ],
          },
        ],
      }),
    );
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);

    const result = await authedCaller().restorePlan({
      planId: "plan-conflict",
      acknowledgedAllergenRisk: false,
    });

    expect(result).toEqual({
      success: false,
      requiresAllergenConfirmation: true,
      conflictingSummary: "Peanut Curry, Satay Noodles",
    });
    expect(dbMocks.transaction).not.toHaveBeenCalled();
    expect(dbMocks.txUpdate).not.toHaveBeenCalled();
  });

  it("commits the restore when allergen risk is acknowledged", async () => {
    dbMocks.findFirstPlan.mockResolvedValueOnce(
      makePlan({
        id: "plan-conflict-ack",
        isActive: false,
        days: [
          {
            id: "day-conflict-ack-1",
            planId: "plan-conflict-ack",
            dayNumber: 1,
            meals: [
              {
                id: "meal-conflict-ack-1",
                dayId: "day-conflict-ack-1",
                mealType: "dinner",
                recipeName: "Peanut Stir Fry",
                imageUrl: null,
                ingredients: [{ name: "peanuts" }] as Array<{ name: string }>,
                instructions: "Cook stir fry",
                cookTimeMinutes: 18,
              },
            ],
          },
        ],
      }),
    );
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);

    const result = await authedCaller().restorePlan({
      planId: "plan-conflict-ack",
      acknowledgedAllergenRisk: true,
    });

    expect(result).toEqual({ success: true, planId: "plan-conflict-ack" });
    expect(dbMocks.transaction).toHaveBeenCalledOnce();
    expect(dbMocks.txUpdateSet).toHaveBeenNthCalledWith(1, { isActive: false });
    expect(dbMocks.txUpdateSet).toHaveBeenNthCalledWith(2, { isActive: true });
  });

  it("returns success directly when no allergen conflict is found", async () => {
    dbMocks.findFirstPlan.mockResolvedValueOnce(
      makePlan({
        id: "plan-safe",
        isActive: false,
        days: [
          {
            id: "day-safe-1",
            planId: "plan-safe",
            dayNumber: 1,
            meals: [
              {
                id: "meal-safe-1",
                dayId: "day-safe-1",
                mealType: "dinner",
                recipeName: "Lentil Soup",
                imageUrl: null,
                ingredients: [{ name: "lentils" }, { name: "carrots" }] as Array<{
                  name: string;
                }>,
                instructions: "Cook soup",
                cookTimeMinutes: 30,
              },
            ],
          },
        ],
      }),
    );
    dbMocks.findFirstProfile.mockResolvedValue(mockProfile);

    const result = await authedCaller().restorePlan({
      planId: "plan-safe",
      acknowledgedAllergenRisk: false,
    });

    expect(result).toEqual({ success: true, planId: "plan-safe" });
    expect(dbMocks.transaction).toHaveBeenCalledOnce();
  });
});
