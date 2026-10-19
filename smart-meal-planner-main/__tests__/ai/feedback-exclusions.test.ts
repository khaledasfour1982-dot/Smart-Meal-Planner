import { describe, expect, it, vi } from "vitest";
import { getDislikedRecipes } from "~/server/ai/feedback-exclusions";

type FeedbackRow = {
  recipeName: string;
  averageRating: number;
};

function createDbMock(rows: FeedbackRow[]) {
  const groupBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ groupBy });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const db = { select } as unknown as Parameters<typeof getDislikedRecipes>[0];

  return { db, select, from, where, groupBy };
}

describe("getDislikedRecipes", () => {
  it("returns empty array when no ratings exist", async () => {
    const { db } = createDbMock([]);

    await expect(getDislikedRecipes(db, "user-1")).resolves.toEqual([]);
  });

  it("excludes recipes with avg < 3", async () => {
    const { db } = createDbMock([
      { recipeName: "Low Soup", averageRating: 2.5 },
      { recipeName: "Very Low Pasta", averageRating: 1.9 },
    ]);

    await expect(getDislikedRecipes(db, "user-1")).resolves.toEqual([
      "Low Soup",
      "Very Low Pasta",
    ]);
  });

  it("does NOT exclude recipes with avg >= 3", async () => {
    const { db } = createDbMock([
      { recipeName: "Okay Curry", averageRating: 3 },
      { recipeName: "Good Salad", averageRating: 4.2 },
    ]);

    await expect(getDislikedRecipes(db, "user-1")).resolves.toEqual([]);
  });

  it("excludes recipe with a single rating below 3", async () => {
    const { db } = createDbMock([
      { recipeName: "Single Vote Stew", averageRating: 1.5 },
    ]);

    await expect(getDislikedRecipes(db, "user-1")).resolves.toEqual([
      "Single Vote Stew",
    ]);
  });
});