import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  findManyMealFeedback: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  onConflictDoUpdate: vi.fn(),
}));

const drizzleExprMocks = vi.hoisted(() => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
  cookies: () => ({ get: () => null, getAll: () => [] }),
}));

vi.mock("~/server/db", () => ({
  db: {
    query: {
      mealFeedback: { findMany: dbMocks.findManyMealFeedback },
    },
    insert: dbMocks.insert,
  },
}));

vi.mock("~/server/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();

  return {
    ...actual,
    and: drizzleExprMocks.and,
    eq: drizzleExprMocks.eq,
    inArray: drizzleExprMocks.inArray,
  };
});

import { feedbackRouter } from "~/server/api/routers/feedback";
import { createCallerFactory } from "~/server/api/trpc";
import { mealFeedback } from "~/server/db/schema";
import { db } from "~/server/db";
import { mockSession } from "../../helpers/mock-session";

const makeCallerFactory = createCallerFactory(feedbackRouter);

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

beforeEach(() => {
  vi.clearAllMocks();

  dbMocks.onConflictDoUpdate.mockResolvedValue(undefined);
  dbMocks.insertValues.mockReturnValue({
    onConflictDoUpdate: dbMocks.onConflictDoUpdate,
  });
  dbMocks.insert.mockReturnValue({ values: dbMocks.insertValues });

  drizzleExprMocks.eq.mockImplementation((column, value) => ({ op: "eq", column, value }));
  drizzleExprMocks.inArray.mockImplementation((column, values) => ({
    op: "inArray",
    column,
    values,
  }));
  drizzleExprMocks.and.mockImplementation((...clauses) => ({ op: "and", clauses }));
});

describe("feedback.rate", () => {
  it("throws UNAUTHORIZED when no session is present", async () => {
    await expect(unauthedCaller().rate({ recipeName: "Pasta", rating: 5 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it("normalizes recipe name and upserts by (userId, recipeName)", async () => {
    const result = await authedCaller("user-1").rate({
      recipeName: "  Spaghetti Bolognese  ",
      rating: 4,
    });

    expect(dbMocks.insert).toHaveBeenCalledWith(mealFeedback);
    expect(dbMocks.insertValues).toHaveBeenCalledWith({
      userId: "user-1",
      recipeName: "spaghetti bolognese",
      rating: 4,
    });
    expect(dbMocks.onConflictDoUpdate).toHaveBeenCalledWith({
      target: [mealFeedback.userId, mealFeedback.recipeName],
      set: { rating: 4 },
    });
    expect(result).toEqual({ success: true });
  });

  it("uses caller session user id for scoping", async () => {
    await authedCaller("user-2").rate({ recipeName: "Pasta", rating: 3 });

    expect(dbMocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-2",
        recipeName: "pasta",
      }),
    );
  });

  it("rejects whitespace-only recipe names after normalization", async () => {
    await expect(authedCaller().rate({ recipeName: "   ", rating: 5 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Recipe name must not be empty.",
    });

    expect(dbMocks.insert).not.toHaveBeenCalled();
  });
});

describe("feedback.getForPlan", () => {
  it("throws UNAUTHORIZED when no session is present", async () => {
    await expect(unauthedCaller().getForPlan({ recipeNames: ["Pasta"] })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    expect(dbMocks.findManyMealFeedback).not.toHaveBeenCalled();
  });

  it("normalizes + deduplicates names, scopes by user, and returns a sparse rating map", async () => {
    dbMocks.findManyMealFeedback.mockResolvedValue([
      { recipeName: "avocado toast", rating: 5 },
      { recipeName: "spaghetti bolognese", rating: 2 },
    ]);

    const result = await authedCaller("user-9").getForPlan({
      recipeNames: [
        " Avocado Toast ",
        "avocado toast",
        "SPAGHETTI BOLOGNESE",
        "",
        "  ",
        "Unknown Dish",
      ],
    });

    expect(drizzleExprMocks.eq).toHaveBeenCalledWith(mealFeedback.userId, "user-9");
    expect(drizzleExprMocks.inArray).toHaveBeenCalledWith(mealFeedback.recipeName, [
      "avocado toast",
      "spaghetti bolognese",
      "unknown dish",
    ]);
    expect(dbMocks.findManyMealFeedback).toHaveBeenCalledWith({
      where: expect.any(Object),
      columns: {
        recipeName: true,
        rating: true,
      },
    });
    expect(result).toEqual({
      "avocado toast": 5,
      "spaghetti bolognese": 2,
    });
  });

  it("returns an empty map and skips DB lookup when all names normalize to empty", async () => {
    const result = await authedCaller().getForPlan({ recipeNames: ["", "   "] });

    expect(result).toEqual({});
    expect(dbMocks.findManyMealFeedback).not.toHaveBeenCalled();
    expect(drizzleExprMocks.inArray).not.toHaveBeenCalled();
  });
});
