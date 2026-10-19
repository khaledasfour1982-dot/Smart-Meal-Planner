import { describe, expect, it } from "vitest";
import { mergeIngredients } from "~/server/ai/unit-normalizer";

type IngredientLike = {
  name: string;
  quantity: number;
  unit: string;
};

function findIngredient(
  ingredients: IngredientLike[],
  name: string,
  unit: string,
): IngredientLike | undefined {
  return ingredients.find(
    (ingredient) =>
      ingredient.name.trim().toLowerCase() === name.trim().toLowerCase() &&
      ingredient.unit === unit,
  );
}

describe("unit normalization and consolidation", () => {
  it("500g + 1kg => 1.5kg", () => {
    const result = mergeIngredients([
      { name: "onion", quantity: 500, unit: "g" },
      { name: "onion", quantity: 1, unit: "kg" },
    ]);

    const onion = findIngredient(result, "onion", "kg");
    expect(onion).toBeDefined();
    expect(onion?.quantity).toBeCloseTo(1.5, 6);
  });

  it("200ml + 0.5L => 700ml", () => {
    const result = mergeIngredients([
      { name: "milk", quantity: 200, unit: "ml" },
      { name: "milk", quantity: 0.5, unit: "L" },
    ]);

    const milk = findIngredient(result, "milk", "ml");
    expect(milk).toBeDefined();
    expect(milk?.quantity).toBeCloseTo(700, 6);
  });

  it("2 pieces + 3 pieces => 5 pieces", () => {
    const result = mergeIngredients([
      { name: "egg", quantity: 2, unit: "pcs" },
      { name: "egg", quantity: 3, unit: "pcs" },
    ]);

    const eggs = findIngredient(result, "egg", "pcs");
    expect(eggs).toBeDefined();
    expect(eggs?.quantity).toBeCloseTo(5, 6);
  });

  it("100g + 200ml are kept separate for the same name", () => {
    const result = mergeIngredients([
      { name: "tomato paste", quantity: 100, unit: "g" },
      { name: "tomato paste", quantity: 200, unit: "ml" },
    ]);

    const grams = findIngredient(result, "tomato paste", "g");
    const milliliters = findIngredient(result, "tomato paste", "ml");

    expect(grams).toBeDefined();
    expect(milliliters).toBeDefined();
    expect(grams?.quantity).toBeCloseTo(100, 6);
    expect(milliliters?.quantity).toBeCloseTo(200, 6);
  });

  it("merges same ingredient regardless of name casing", () => {
    const result = mergeIngredients([
      { name: "Onion", quantity: 1, unit: "kg" },
      { name: "onion", quantity: 500, unit: "g" },
    ]);

    const onionKg = findIngredient(result, "onion", "kg");
    expect(onionKg).toBeDefined();
    expect(onionKg?.quantity).toBeCloseTo(1.5, 6);
  });

  it("1000ml => 1L", () => {
    const result = mergeIngredients([{ name: "broth", quantity: 1000, unit: "ml" }]);

    const broth = findIngredient(result, "broth", "L");
    expect(broth).toBeDefined();
    expect(broth?.quantity).toBeCloseTo(1, 6);
  });

  it("1500g => 1.5kg", () => {
    const result = mergeIngredients([{ name: "flour", quantity: 1500, unit: "g" }]);

    const flour = findIngredient(result, "flour", "kg");
    expect(flour).toBeDefined();
    expect(flour?.quantity).toBeCloseTo(1.5, 6);
  });
});
