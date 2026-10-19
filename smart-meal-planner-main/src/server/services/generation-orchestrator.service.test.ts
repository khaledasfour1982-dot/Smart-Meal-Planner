import { beforeEach, describe, expect, it, vi } from "vitest";

const dayGenerationMocks = vi.hoisted(() => ({
  generatePlanDay: vi.fn(),
}));

vi.mock("~/server/services/day-generation.service", () => ({
  generatePlanDay: dayGenerationMocks.generatePlanDay,
}));

import { runGenerationOrchestrator } from "~/server/services/generation-orchestrator.service";

type OrchestratorInput = Parameters<typeof runGenerationOrchestrator>[0];

function createDbMock() {
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  return {
    db: {
      update,
    },
    spies: {
      update,
      updateSet,
      updateWhere,
    },
  };
}

function createInput(db: unknown) {
  return {
    db: db as OrchestratorInput["db"],
    userId: "user-1",
    planId: "plan-1",
    planDays: 3,
    mealSelection: {
      "1": { breakfast: false, lunch: false, dinner: true },
      "2": { breakfast: true, lunch: false, dinner: true },
      "3": { breakfast: false, lunch: true, dinner: true },
    },
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runGenerationOrchestrator", () => {
  it("sets plan status to completed when all day generations succeed", async () => {
    const { db, spies } = createDbMock();

    dayGenerationMocks.generatePlanDay
      .mockResolvedValueOnce({
        status: "success",
        planId: "plan-1",
        dayId: "day-1",
        dayNumber: 1,
        generatedMeals: 1,
      })
      .mockResolvedValueOnce({
        status: "success",
        planId: "plan-1",
        dayId: "day-2",
        dayNumber: 2,
        generatedMeals: 2,
      })
      .mockResolvedValueOnce({
        status: "success",
        planId: "plan-1",
        dayId: "day-3",
        dayNumber: 3,
        generatedMeals: 1,
      });

    const result = await runGenerationOrchestrator(createInput(db));

    expect(result.status).toBe("completed");
    expect(result.succeededDays).toEqual([1, 2, 3]);
    expect(result.failedDays).toEqual([]);
    expect(dayGenerationMocks.generatePlanDay).toHaveBeenCalledTimes(3);

    expect(spies.updateSet).toHaveBeenNthCalledWith(1, {
      generationStatus: "in_progress",
    });
    expect(spies.updateSet).toHaveBeenNthCalledWith(2, {
      generationStatus: "completed",
    });
  });

  it("continues loop and sets partial_failure when one or more days fail", async () => {
    const { db, spies } = createDbMock();

    dayGenerationMocks.generatePlanDay
      .mockResolvedValueOnce({
        status: "success",
        planId: "plan-1",
        dayId: "day-1",
        dayNumber: 1,
        generatedMeals: 1,
      })
      .mockResolvedValueOnce({
        status: "failed",
        planId: "plan-1",
        dayId: "day-2",
        dayNumber: 2,
        failureReason: "provider_error",
        attempts: 1,
        generationReason: "provider_error",
      })
      .mockResolvedValueOnce({
        status: "success",
        planId: "plan-1",
        dayId: "day-3",
        dayNumber: 3,
        generatedMeals: 2,
      });

    const result = await runGenerationOrchestrator(createInput(db));

    expect(result.status).toBe("partial_failure");
    expect(result.succeededDays).toEqual([1, 3]);
    expect(result.failedDays).toEqual([2]);
    expect(dayGenerationMocks.generatePlanDay).toHaveBeenCalledTimes(3);
    expect(dayGenerationMocks.generatePlanDay).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ dayNumber: 3 }),
    );

    expect(spies.updateSet).toHaveBeenNthCalledWith(2, {
      generationStatus: "partial_failure",
    });
  });

  it("sets in_progress before triggering day generation", async () => {
    const { db, spies } = createDbMock();

    dayGenerationMocks.generatePlanDay.mockResolvedValue({
      status: "success",
      planId: "plan-1",
      dayId: "day-1",
      dayNumber: 1,
      generatedMeals: 1,
    });

    await runGenerationOrchestrator(createInput(db));

    expect(spies.updateSet).toHaveBeenCalledWith({
      generationStatus: "in_progress",
    });

    expect(spies.updateSet.mock.invocationCallOrder[0]).toBeLessThan(
      dayGenerationMocks.generatePlanDay.mock.invocationCallOrder[0]!,
    );
  });
});
