import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
  cookies: () => ({ get: () => null, getAll: () => [] }),
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

const fullListRecord = {
  id: "list-1",
  userId: "user-1",
  scope: "plan",
  scopeId: "plan-1",
  name: "Renamed List",
  createdAt: new Date("2026-03-20T00:00:00.000Z"),
  updatedAt: new Date("2026-03-20T00:00:00.000Z"),
  items: [
    {
      id: "item-1",
      shoppingListId: "list-1",
      ingredientName: "onion",
      quantity: "2.5",
      unit: "kg",
      category: "Produce",
      isChecked: false,
      isManual: false,
      createdAt: new Date("2026-03-20T00:00:00.000Z"),
      updatedAt: new Date("2026-03-20T00:00:00.000Z"),
    },
  ],
};

function buildUpdateChain(updatedRows: Array<{ id: string }>) {
  const returning = vi.fn().mockResolvedValue(updatedRows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });

  return {
    update,
    set,
    where,
    returning,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("shoppingList.updateName", () => {
  it("allows owner to update their own shopping list name", async () => {
    const chain = buildUpdateChain([{ id: "list-1" }]);

    const db = {
      update: chain.update,
      query: {
        shoppingLists: {
          findFirst: vi.fn().mockResolvedValue(fullListRecord),
        },
      },
    };

    const result = await authedCaller(db).updateName({
      id: "list-1",
      name: "  Renamed List  ",
    });

    expect(chain.set).toHaveBeenCalledWith({ name: "Renamed List" });
    expect(result.name).toBe("Renamed List");
    expect(result.items[0]?.quantity).toBe(2.5);
  });

  it("returns FORBIDDEN when a non-owner tries to update an existing list", async () => {
    const chain = buildUpdateChain([]);

    const db = {
      update: chain.update,
      query: {
        shoppingLists: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: "list-1" }),
        },
      },
    };

    await expect(
      authedCaller(db, "user-1").updateName({ id: "list-1", name: "Unauthorized Rename" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects empty name with validation error", async () => {
    const chain = buildUpdateChain([{ id: "list-1" }]);

    const db = {
      update: chain.update,
      query: {
        shoppingLists: {
          findFirst: vi.fn(),
        },
      },
    };

    await expect(
      authedCaller(db).updateName({ id: "list-1", name: "   " }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(chain.update).not.toHaveBeenCalled();
  });

  it("rejects names longer than 100 characters", async () => {
    const chain = buildUpdateChain([{ id: "list-1" }]);

    const db = {
      update: chain.update,
      query: {
        shoppingLists: {
          findFirst: vi.fn(),
        },
      },
    };

    await expect(
      authedCaller(db).updateName({ id: "list-1", name: "x".repeat(101) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(chain.update).not.toHaveBeenCalled();
  });

  it("returns full shopping list object with items after update", async () => {
    const chain = buildUpdateChain([{ id: "list-1" }]);

    const db = {
      update: chain.update,
      query: {
        shoppingLists: {
          findFirst: vi.fn().mockResolvedValue(fullListRecord),
        },
      },
    };

    const result = await authedCaller(db).updateName({
      id: "list-1",
      name: "Renamed List",
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: "list-1",
        name: "Renamed List",
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: "item-1",
        ingredientName: "onion",
        quantity: 2.5,
      }),
    );
  });

  it("returns NOT_FOUND when updating a non-existent shopping list", async () => {
    const chain = buildUpdateChain([]);

    const db = {
      update: chain.update,
      query: {
        shoppingLists: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
      },
    };

    await expect(
      authedCaller(db).updateName({ id: "missing-list", name: "Any Name" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is idempotent when updating to the same name multiple times", async () => {
    const chain = buildUpdateChain([{ id: "list-1" }]);

    const db = {
      update: chain.update,
      query: {
        shoppingLists: {
          findFirst: vi.fn().mockResolvedValue(fullListRecord),
        },
      },
    };

    const caller = authedCaller(db);

    await expect(caller.updateName({ id: "list-1", name: "Renamed List" })).resolves.toBeDefined();
    await expect(caller.updateName({ id: "list-1", name: "Renamed List" })).resolves.toBeDefined();

    expect(chain.update).toHaveBeenCalledTimes(2);
    expect(chain.set).toHaveBeenNthCalledWith(1, { name: "Renamed List" });
    expect(chain.set).toHaveBeenNthCalledWith(2, { name: "Renamed List" });
  });
});

describe("shoppingList.getList", () => {
  it("returns shopping list with pricing fields enriched from dataset", async () => {
    const listWithChickenBreast = {
      ...fullListRecord,
      items: [
        {
          id: "item-1",
          shoppingListId: "list-1",
          ingredientName: "chicken breast",
          quantity: "1",
          unit: "kg",
          category: "Meat & Fish",
          isChecked: false,
          isManual: false,
          createdAt: new Date("2026-03-20T00:00:00.000Z"),
          updatedAt: new Date("2026-03-20T00:00:00.000Z"),
        },
      ],
    };

    const db = {
      query: {
        shoppingLists: {
          findFirst: vi.fn().mockResolvedValue(listWithChickenBreast),
        },
      },
    };

    const result = await authedCaller(db).getList({ id: "list-1" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        ingredientName: "chicken breast",
        quantity: 1,
        estimatedPriceEur: 5.49,
        priceUnit: "kg",
        typicalStore: "Any",
      }),
    );
    expect(result.estimatedTotal).toBeCloseTo(5.49, 2);
  });

  it("handles items with no matching price gracefully (null fields)", async () => {
    const listWithUnknown = {
      ...fullListRecord,
      items: [
        {
          id: "item-1",
          shoppingListId: "list-1",
          ingredientName: "unobtanium",
          quantity: "5",
          unit: "kg",
          category: "Unknown",
          isChecked: false,
          isManual: false,
          createdAt: new Date("2026-03-20T00:00:00.000Z"),
          updatedAt: new Date("2026-03-20T00:00:00.000Z"),
        },
      ],
    };

    const db = {
      query: {
        shoppingLists: {
          findFirst: vi.fn().mockResolvedValue(listWithUnknown),
        },
      },
    };

    const result = await authedCaller(db).getList({ id: "list-1" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        ingredientName: "unobtanium",
        estimatedPriceEur: null,
        priceUnit: null,
        typicalStore: null,
      }),
    );
    expect(result.estimatedTotal).toBe(0);
  });

  it("includes estimatedTotal in response for mixed known/unknown items", async () => {
    const listMixed = {
      ...fullListRecord,
      items: [
        {
          id: "item-1",
          shoppingListId: "list-1",
          ingredientName: "onion",
          quantity: "2",
          unit: "kg",
          category: "Produce",
          isChecked: false,
          isManual: false,
          createdAt: new Date("2026-03-20T00:00:00.000Z"),
          updatedAt: new Date("2026-03-20T00:00:00.000Z"),
        },
        {
          id: "item-2",
          shoppingListId: "list-1",
          ingredientName: "unobtanium",
          quantity: "1",
          unit: "kg",
          category: "Unknown",
          isChecked: false,
          isManual: false,
          createdAt: new Date("2026-03-20T00:00:00.000Z"),
          updatedAt: new Date("2026-03-20T00:00:00.000Z"),
        },
        {
          id: "item-3",
          shoppingListId: "list-1",
          ingredientName: "chicken breast",
          quantity: "0.5",
          unit: "kg",
          category: "Meat & Fish",
          isChecked: false,
          isManual: false,
          createdAt: new Date("2026-03-20T00:00:00.000Z"),
          updatedAt: new Date("2026-03-20T00:00:00.000Z"),
        },
      ],
    };

    const db = {
      query: {
        shoppingLists: {
          findFirst: vi.fn().mockResolvedValue(listMixed),
        },
      },
    };

    const result = await authedCaller(db).getList({ id: "list-1" });

    expect(result.items).toHaveLength(3);

    // onion: 0.99 * 2 = 1.98
    // unobtanium: skip (no price)
    // chicken breast: 5.49 * 0.5 = 2.745
    // Total: 1.98 + 2.745 = 4.725
    expect(result.estimatedTotal).toBeCloseTo(4.725, 2);
  });

  it("requires authentication and returns FORBIDDEN for non-owner", async () => {
    // Test that getOwnedListOrThrow first checks ownership via the compound query,
    // then throws FORBIDDEN if found but different owner.
    // We mock the initial findFirst to return a list with different userId.
    const dbFindFirstMock = vi.fn()
      .mockResolvedValueOnce(null) // First call: findFirst with and() clause returns null (not owned)
      .mockResolvedValueOnce({ id: "list-1" }); // Second call: findFirst with single id returns the list (exists)

    const db = {
      query: {
        shoppingLists: {
          findFirst: dbFindFirstMock,
        },
      },
    };

    // Attempt to access with user-1 which doesn't own list-1
    await expect(authedCaller(db, "user-1").getList({ id: "list-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns NOT_FOUND for non-existent list", async () => {
    const db = {
      query: {
        shoppingLists: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    };

    await expect(authedCaller(db).getList({ id: "missing-list" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
