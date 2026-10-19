import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  findFirstProfile: vi.fn(),
  select: vi.fn(),
  selectFrom: vi.fn(),
  selectWhere: vi.fn(),
  selectGroupBy: vi.fn(),
  selectOrderBy: vi.fn(),
  selectLimit: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  transaction: vi.fn(),
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

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
  cookies: () => ({ get: () => null, getAll: () => [] }),
}));

vi.mock("~/server/db", () => ({
  db: {
    select: dbMocks.select,
    update: dbMocks.update,
    query: {
      profiles: { findFirst: dbMocks.findFirstProfile },
    },
    transaction: dbMocks.transaction,
  },
}));

vi.mock("~/server/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

vi.mock("~/server/services/generation-orchestrator.service", () => ({
  runGenerationOrchestrator: generationMocks.runGenerationOrchestrator,
}));

import { planRouter } from "~/server/api/routers/plan";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";
import { mockSession } from "../../helpers/mock-session";

const makeCallerFactory = createCallerFactory(planRouter);

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
  portionMultipliers: { adult: 1.2, child: 0.8, toddler: 0.6 },
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  dbMocks.txUpdateWhere.mockResolvedValue(undefined);
  dbMocks.txUpdateSet.mockReturnValue({ where: dbMocks.txUpdateWhere });
  dbMocks.txUpdate.mockReturnValue({ set: dbMocks.txUpdateSet });
  dbMocks.updateWhere.mockResolvedValue(undefined);
  dbMocks.updateSet.mockReturnValue({ where: dbMocks.updateWhere });
  dbMocks.update.mockReturnValue({ set: dbMocks.updateSet });

  dbMocks.txInsertPlanReturning.mockResolvedValue([{ id: "plan-123" }]);
  dbMocks.txInsertPlanValues.mockReturnValue({
    returning: dbMocks.txInsertPlanReturning,
  });
  dbMocks.txInsertDaysValues.mockResolvedValue(undefined);

  dbMocks.txInsert
    .mockReturnValueOnce({ values: dbMocks.txInsertPlanValues })
    .mockReturnValueOnce({ values: dbMocks.txInsertDaysValues });

  dbMocks.selectLimit
    .mockResolvedValueOnce([
      { id: "plan-previous-1" },
      { id: "plan-previous-2" },
    ])
    .mockResolvedValueOnce([
      { recipeName: "Tofu Stir Fry" },
      { recipeName: "  Pasta Primavera  " },
      { recipeName: "Tofu Stir Fry" },
    ]);

  dbMocks.selectGroupBy.mockResolvedValue([
    { recipeName: "Peanut Curry", averageRating: 2.2 },
    { recipeName: "Greek Salad", averageRating: 4.1 },
  ]);

  dbMocks.selectOrderBy.mockReturnValue({
    limit: dbMocks.selectLimit,
  });

  dbMocks.selectWhere
    .mockReturnValueOnce({ groupBy: dbMocks.selectGroupBy })
    .mockReturnValueOnce({ orderBy: dbMocks.selectOrderBy })
    .mockResolvedValueOnce([{ id: "day-prev-1" }, { id: "day-prev-2" }])
    .mockReturnValueOnce({ limit: dbMocks.selectLimit });

  dbMocks.selectFrom.mockReturnValue({ where: dbMocks.selectWhere });
  dbMocks.select.mockReturnValue({ from: dbMocks.selectFrom });

  dbMocks.transaction.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        update: dbMocks.txUpdate,
        insert: dbMocks.txInsert,
      }),
  );

  dbMocks.findFirstProfile.mockResolvedValue(mockProfile);
  generationMocks.runGenerationOrchestrator.mockResolvedValue({
    status: "completed",
    succeededDays: [1],
    failedDays: [],
    outcomes: [],
  });
});

describe("plan.generate", () => {
  it("throws UNAUTHORIZED when no session is present", async () => {
    await expect(
      unauthedCaller().generate({ days: 2, mealsPerDay: "2" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(dbMocks.findFirstProfile).not.toHaveBeenCalled();
    expect(generationMocks.runGenerationOrchestrator).not.toHaveBeenCalled();
  });

  it("returns immediately with stream metadata", async () => {
    generationMocks.runGenerationOrchestrator.mockImplementation(
      async () => await new Promise(() => undefined),
    );

    const result = await authedCaller().generate({ days: 2, mealsPerDay: "2" });

    expect(result).toEqual({
      planId: "plan-123",
      requestedDays: 2,
      streamUrl: "/api/generation/stream?planId=plan-123",
    });
  });

  it("builds orchestration input from profile and requested meal selection", async () => {
    await authedCaller().generate({ days: 2, mealsPerDay: "2" });

    expect(generationMocks.runGenerationOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        planId: "plan-123",
        household: { adults: 2, children: 1, toddlers: 1 },
        dietTypes: ["vegetarian"],
        allergens: ["peanuts"],
        dislikes: ["cilantro"],
        weeklyBudgetEuro: 100,
        planDays: 2,
        mealSelection: {
          "1": { breakfast: false, lunch: true, dinner: true },
          "2": { breakfast: false, lunch: true, dinner: true },
        },
        portionMultipliers: { adult: 1.2, child: 0.8, toddler: 0.6 },
      }),
    );
  });

  it("creates an active in-progress plan shell before detached orchestration", async () => {
    await authedCaller().generate({ days: 1, mealsPerDay: "3" });

    expect(dbMocks.transaction).toHaveBeenCalledOnce();
    expect(dbMocks.txInsertPlanValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        planDays: 1,
        generationStatus: "in_progress",
        isActive: true,
      }),
    );
    expect(dbMocks.txInsertDaysValues).toHaveBeenCalledWith([
      expect.objectContaining({ planId: "plan-123", dayNumber: 1, status: "pending" }),
    ]);
    expect(generationMocks.runGenerationOrchestrator).toHaveBeenCalledOnce();
  });

  it("rejects invalid input at the router validation boundary", async () => {
    await expect(
      authedCaller().generate({ days: 0, mealsPerDay: "3" }),
    ).rejects.toThrow();

    expect(generationMocks.runGenerationOrchestrator).not.toHaveBeenCalled();
  });

  it("marks unresolved days as failed/provider_error when detached orchestrator crashes", async () => {
    generationMocks.runGenerationOrchestrator.mockRejectedValueOnce(
      new Error("orchestrator crashed"),
    );

    const result = await authedCaller().generate({ days: 2, mealsPerDay: "2" });

    expect(result).toEqual({
      planId: "plan-123",
      requestedDays: 2,
      streamUrl: "/api/generation/stream?planId=plan-123",
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(dbMocks.updateSet).toHaveBeenNthCalledWith(1, {
      status: "failed",
      failureReason: "provider_error",
    });
    expect(dbMocks.updateSet).toHaveBeenNthCalledWith(2, {
      generationStatus: "partial_failure",
    });
    expect(dbMocks.updateWhere).toHaveBeenCalledTimes(2);
  });
});