import { describe, expect, it } from "vitest";
import { aggregateIngredients } from "~/server/services/shopping-list.service";

type AggregatedItem = {
  name: string;
  unit: string;
  quantity: number;
};

function findItem(
  items: AggregatedItem[],
  name: string,
  unit: string,
): AggregatedItem | undefined {
  return items.find(
    (item) =>
      item.name.trim().toLowerCase() === name.trim().toLowerCase() &&
      item.unit === unit,
  );
}
describe("shopping-list.service aggregation", () => {
  it("aggregates ingredients for meal scope using a mocked DB", async () => {
    const db = {
      query: {
        meals: {
          findFirst: async () => ({
            id: "meal-1",
            dayId: "day-1",
            day: { planId: "plan-1", userId: "user-1" },
            ingredients: [
              { name: "onion", quantity: 500, unit: "g" },
              { name: "Onion", quantity: 1, unit: "kg" },
            ],
          }),
        },
      },
    };

    const items = (await aggregateIngredients(
      "meal",
      "meal-1",
      db as never,
    )) as AggregatedItem[];

    const onion = findItem(items, "onion", "kg");
    expect(onion).toBeDefined();
    expect(onion?.quantity).toBeCloseTo(1.5, 6);
  });

  it("aggregates ingredients for day scope using a mocked DB", async () => {
    const db = {
      query: {
        days: {
          findFirst: async () => ({
            id: "day-1",
            planId: "plan-1",
            plan: { userId: "user-1" },
            meals: [
              {
                id: "meal-1",
                ingredients: [{ name: "milk", quantity: 200, unit: "ml" }],
              },
              {
                id: "meal-2",
                ingredients: [{ name: "milk", quantity: 0.5, unit: "L" }],
              },
            ],
          }),
        },
      },
    };

    const items = (await aggregateIngredients(
      "day",
      "day-1",
      db as never,
    )) as AggregatedItem[];

    const milk = findItem(items, "milk", "ml");
    expect(milk).toBeDefined();
    expect(milk?.quantity).toBeCloseTo(700, 6);
  });

  it("aggregates ingredients for plan scope using a mocked DB", async () => {
    const db = {
      query: {
        plans: {
          findFirst: async () => ({
            id: "plan-1",
            userId: "user-1",
            days: [
              {
                id: "day-1",
                meals: [
                  {
                    id: "meal-1",
                    ingredients: [
                      { name: "egg", quantity: 2, unit: "pcs" },
                      { name: "olive oil", quantity: 100, unit: "g" },
                    ],
                  },
                ],
              },
              {
                id: "day-2",
                meals: [
                  {
                    id: "meal-2",
                    ingredients: [
                      { name: "egg", quantity: 3, unit: "pcs" },
                      { name: "olive oil", quantity: 200, unit: "ml" },
                    ],
                  },
                ],
              },
            ],
          }),
        },
      },
    };

    const items = (await aggregateIngredients(
      "plan",
      "plan-1",
      db as never,
    )) as AggregatedItem[];

    const eggs = findItem(items, "egg", "pcs");
    const oilG = findItem(items, "olive oil", "g");
    const oilMl = findItem(items, "olive oil", "ml");

    expect(eggs).toBeDefined();
    expect(eggs?.quantity).toBeCloseTo(5, 6);
    expect(oilG).toBeDefined();
    expect(oilMl).toBeDefined();
  });

  it("aggregates ingredients for selected plan days when dayIds are provided", async () => {
    const db = {
      query: {
        plans: {
          findFirst: async () => ({
            id: "plan-1",
            userId: "user-1",
            days: [
              {
                id: "day-1",
                meals: [
                  {
                    id: "meal-1",
                    ingredients: [{ name: "egg", quantity: 2, unit: "pcs" }],
                  },
                ],
              },
              {
                id: "day-2",
                meals: [
                  {
                    id: "meal-2",
                    ingredients: [{ name: "egg", quantity: 3, unit: "pcs" }],
                  },
                ],
              },
            ],
          }),
        },
      },
    };

    const items = (await aggregateIngredients(
      "plan",
      "plan-1",
      db as never,
      ["day-2"],
    )) as AggregatedItem[];

    const eggs = findItem(items, "egg", "pcs");

    expect(eggs).toBeDefined();
    expect(eggs?.quantity).toBeCloseTo(3, 6);
  });
});
