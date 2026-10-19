import { describe, expect, it } from "vitest";
import {
  applyRounding,
  calculateHouseholdMultiplier,
  scaleIngredients,
} from "~/server/ai/portion-scaler";
import type { Ingredient } from "~/server/ai/meal-plan-schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ingredient(
  name: string,
  quantity: number,
  unit = "pieces",
): Ingredient {
  return { name, quantity, unit, category: "Produce", estPriceEuro: 0.5 };
}

// ---------------------------------------------------------------------------
// calculateHouseholdMultiplier
// ---------------------------------------------------------------------------

describe("calculateHouseholdMultiplier", () => {
  it("returns 1.0 for a single adult with default multipliers", () => {
    expect(
      calculateHouseholdMultiplier({ adults: 1, children: 0, toddlers: 0 }),
    ).toBe(1.0);
  });

  it("returns 3.25 for 2 adults + 1 child + 1 toddler (FR-4.1 canonical example)", () => {
    // 2×1.0 + 1×0.75 + 1×0.5 = 3.25
    expect(
      calculateHouseholdMultiplier({ adults: 2, children: 1, toddlers: 1 }),
    ).toBeCloseTo(3.25);
  });

  it("uses custom multipliers when provided", () => {
    // 2×1.2 + 1×0.8 + 1×0.6 = 2.4 + 0.8 + 0.6 = 3.8
    expect(
      calculateHouseholdMultiplier(
        { adults: 2, children: 1, toddlers: 1 },
        { adult: 1.2, child: 0.8, toddler: 0.6 },
      ),
    ).toBeCloseTo(3.8);
  });

  it("returns 0 for an empty household (no members)", () => {
    expect(
      calculateHouseholdMultiplier({ adults: 0, children: 0, toddlers: 0 }),
    ).toBe(0);
  });

  it("handles children-only household", () => {
    // 0 adults + 3 children + 0 toddlers = 3×0.75 = 2.25
    expect(
      calculateHouseholdMultiplier({ adults: 0, children: 3, toddlers: 0 }),
    ).toBeCloseTo(2.25);
  });
});

// ---------------------------------------------------------------------------
// applyRounding
// ---------------------------------------------------------------------------

describe("applyRounding", () => {
  describe("qty > 1 → nearest 0.25", () => {
    it("leaves 6.5 unchanged (already on 0.25 boundary)", () => {
      expect(applyRounding(6.5)).toBe(6.5);
    });

    it("rounds 6.3 down to 6.25", () => {
      expect(applyRounding(6.3)).toBe(6.25);
    });

    it("rounds 6.4 up to 6.5 (above 6.375 midpoint)", () => {
      // midpoint between 6.25 and 6.5 is 6.375; 6.4 > 6.375 → rounds up
      expect(applyRounding(6.4)).toBe(6.5);
    });

    it("rounds 6.37 down to 6.25 (below 6.375 midpoint)", () => {
      // 6.37 < 6.375 → rounds down
      expect(applyRounding(6.37)).toBe(6.25);
    });

    it("rounds 1.1 down to 1.0", () => {
      // Math.round(1.1 / 0.25) * 0.25 = Math.round(4.4) * 0.25 = 4 * 0.25 = 1.0
      expect(applyRounding(1.1)).toBe(1.0);
    });

    it("rounds 1.125 up to 1.25", () => {
      // Math.round(1.125 / 0.25) * 0.25 = Math.round(4.5) * 0.25 = 5 * 0.25 = 1.25
      expect(applyRounding(1.125)).toBe(1.25);
    });
  });

  describe("qty ≤ 1 → nearest 0.1", () => {
    it("rounds 0.33 to 0.3", () => {
      expect(applyRounding(0.33)).toBeCloseTo(0.3);
    });

    it("rounds 0.37 to 0.4", () => {
      expect(applyRounding(0.37)).toBeCloseTo(0.4);
    });

    it("leaves 0.5 unchanged (already on 0.1 boundary)", () => {
      expect(applyRounding(0.5)).toBeCloseTo(0.5);
    });

    it("handles qty exactly 1.0 using 0.1 rounding (boundary is exclusive >)", () => {
      // qty = 1.0 → else branch → roundToNearest(1.0, 0.1) = 1.0
      expect(applyRounding(1.0)).toBeCloseTo(1.0);
    });
  });
});

// ---------------------------------------------------------------------------
// scaleIngredients
// ---------------------------------------------------------------------------

describe("scaleIngredients", () => {
  const household = { adults: 2, children: 1, toddlers: 1 }; // factor = 3.25

  it("scales 2 onions by 3.25x to 6.5 (FR-4.1 canonical example)", () => {
    const result = scaleIngredients([ingredient("onion", 2)], household);
    // 2 * 3.25 = 6.5; applyRounding(6.5) = 6.5
    expect(result[0]!.quantity).toBe(6.5);
  });

  it("does not mutate the original ingredient array", () => {
    const original = [ingredient("carrot", 1)];
    scaleIngredients(original, household);
    expect(original[0]!.quantity).toBe(1); // unchanged
  });

  it("preserves all non-quantity fields", () => {
    const result = scaleIngredients(
      [ingredient("flour", 0.25, "kg")],
      { adults: 1, children: 0, toddlers: 0 },
    );
    expect(result[0]).toMatchObject({
      name: "flour",
      unit: "kg",
      category: "Produce",
    });
  });

  it("uses custom multipliers when provided", () => {
    const customMultipliers = { adult: 2.0, child: 1.0, toddler: 0.5 };
    // factor = 2×2.0 + 1×1.0 + 1×0.5 = 5.5
    // 2 * 5.5 = 11.0; applyRounding(11.0) = 11.0
    const result = scaleIngredients(
      [ingredient("egg", 2)],
      household,
      customMultipliers,
    );
    expect(result[0]!.quantity).toBe(11.0);
  });

  it("falls back to default multipliers when null is passed", () => {
    const withNull = scaleIngredients([ingredient("onion", 2)], household, null);
    const withUndefined = scaleIngredients([ingredient("onion", 2)], household, undefined);
    // Both should use defaults → same result
    expect(withNull[0]!.quantity).toBe(withUndefined[0]!.quantity);
    expect(withNull[0]!.quantity).toBe(6.5);
  });

  it("returns an empty array for an empty ingredient list", () => {
    expect(scaleIngredients([], household)).toEqual([]);
  });

  it("rounds sub-unit quantities to nearest 0.1", () => {
    // 0.33 * 1.0 (solo adult) = 0.33 → roundToNearest(0.33, 0.1) ≈ 0.3
    const result = scaleIngredients(
      [ingredient("vanilla extract", 0.33, "tsp")],
      { adults: 1, children: 0, toddlers: 0 },
    );
    expect(result[0]!.quantity).toBeCloseTo(0.3);
  });
});
