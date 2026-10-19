import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  aggregateIngredients: vi.fn(),
}));

const categorizerMocks = vi.hoisted(() => ({
  categorizeIngredients: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
  cookies: () => ({ get: () => null, getAll: () => [] }),
}));

vi.mock("~/server/services/shopping-list.service", () => ({
  aggregateIngredients: serviceMocks.aggregateIngredients,
}));

vi.mock("~/server/ai/aisle-categorizer", () => ({
  categorizeIngredients: categorizerMocks.categorizeIngredients,
}));

import { shoppingListRouter } from "~/server/api/routers/shopping-list";
import { createCallerFactory } from "~/server/api/trpc";
import { mockSession } from "../../helpers/mock-session";

const makeCallerFactory = createCallerFactory(shoppingListRouter);

type CallerInput = Extract<Parameters<typeof makeCallerFactory>[0], { db: unknown }>;

function makeCallerWithContext(dbOverrides: unknown, session: CallerInput["session"]) {
  const context: CallerInput = {
    db: dbOverrides as CallerInput["db"],
    session,
    headers: new Headers(),
  };

  return makeCallerFactory(context);
}

function authedCaller(dbOverrides: unknown, userId = "user-1") {
  return makeCallerWithContext(dbOverrides, mockSession(userId));
}

function unauthedCaller(dbOverrides: unknown) {
  return makeCallerWithContext(dbOverrides, null);
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceMocks.aggregateIngredients.mockResolvedValue([
    { name: "onion", quantity: 1.5, unit: "kg", category: "Produce" },
  ]);
  categorizerMocks.categorizeIngredients.mockResolvedValue({ onion: "Produce" });
});

describe("shoppingList.generateList", () => {
  it("returns FORBIDDEN when user attempts to generate list for another user's plan", async () => {
    const db = {
      query: {
        plans: {
          findFirst: vi.fn().mockResolvedValue({ id: "plan-2", userId: "user-2" }),
        },
      },
      transaction: vi.fn(),
    };

    await expect(
      authedCaller(db).generateList({ scope: "plan", scopeId: "plan-2" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(serviceMocks.aggregateIngredients).not.toHaveBeenCalled();
  });

  it("passes dayIds to aggregateIngredients for plan-scoped list generation", async () => {
    serviceMocks.aggregateIngredients.mockResolvedValueOnce([]);

    const tx = {
      query: {
        shoppingLists: {
          findFirst: vi.fn().mockResolvedValue({ id: "list-1" }),
        },
      },
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
      insert: vi.fn(),
    };

    const db = {
      query: {
        plans: {
          findFirst: vi.fn().mockResolvedValue({ id: "plan-1", userId: "user-1" }),
        },
        shoppingLists: {
          findFirst: vi.fn().mockResolvedValue({
            id: "list-1",
            userId: "user-1",
            scope: "plan",
            scopeId: "plan-1",
            name: "Plan Shopping List",
            createdAt: new Date(),
            updatedAt: new Date(),
            items: [],
          }),
        },
      },
      transaction: vi.fn(async (callback: (dbTx: typeof tx) => Promise<string>) =>
        callback(tx),
      ),
    };

    await authedCaller(db).generateList({
      scope: "plan",
      scopeId: "plan-1",
      dayIds: ["day-2", "day-3"],
    });

    expect(serviceMocks.aggregateIngredients).toHaveBeenCalledWith(
      "plan",
      "plan-1",
      db,
      ["day-2", "day-3"],
    );
  });
});

describe("shoppingList.addItem", () => {
  it("returns BAD_REQUEST for invalid input payload", async () => {
    const db = {
      query: {
        shoppingLists: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn(),
    };

    await expect(
      authedCaller(db).addItem({
        listId: "list-1",
        ingredientName: "",
        quantity: -1,
        unit: "",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("shoppingList.toggleChecked", () => {
  it("returns FORBIDDEN when toggling an item owned by another user", async () => {
    const db = {
      query: {
        shoppingListItems: {
          findFirst: vi.fn().mockResolvedValue({
            id: "item-2",
            isChecked: false,
            shoppingList: { userId: "user-2" },
          }),
        },
      },
      update: vi.fn(),
    };

    await expect(
      authedCaller(db).toggleChecked({ itemId: "item-2", checked: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("shoppingList.deleteItem", () => {
  it("returns NOT_FOUND when deleting a missing item", async () => {
    const db = {
      query: {
        shoppingListItems: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      delete: vi.fn(),
    };

    await expect(
      authedCaller(db).deleteItem({ itemId: "missing-item" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns UNAUTHORIZED when called without authentication", async () => {
    const db = {
      query: {
        plans: { findFirst: vi.fn() },
      },
    };

    await expect(
      unauthedCaller(db).generateList({ scope: "plan", scopeId: "plan-1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});