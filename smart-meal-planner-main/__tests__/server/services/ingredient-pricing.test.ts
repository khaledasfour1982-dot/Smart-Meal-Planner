/**
 * Tests for ingredient pricing service.
 *
 * Covers:
 * - lookupPrice() — exact, case-insensitive, partial match
 * - estimateListTotal() — aggregation with unit normalization
 */

import { describe, expect, it } from "vitest";
import {
  lookupPrice,
  estimateListTotal,
} from "~/server/services/ingredient-pricing.service";

describe("ingredient-pricing.service", () => {
  describe("lookupPrice()", () => {
    it("returns exact match for 'chicken breast' with price 5.49 EUR/kg", () => {
      const result = lookupPrice("chicken breast");

      expect(result).toBeDefined();
      expect(result?.name).toBe("chicken breast");
      expect(result?.estimatedPriceEur).toBe(5.49);
      expect(result?.unit).toBe("kg");
      expect(result?.category).toBe("Meat & Fish");
      expect(result?.typicalStore).toBe("Any");
    });

    it("is case insensitive ('Chicken Breast' returns same as 'chicken breast')", () => {
      const lowerResult = lookupPrice("chicken breast");
      const upperResult = lookupPrice("Chicken Breast");
      const mixedResult = lookupPrice("ChIcKeN bReAsT");

      expect(upperResult).toEqual(lowerResult);
      expect(mixedResult).toEqual(lowerResult);
      expect(upperResult?.estimatedPriceEur).toBe(5.49);
    });

    it("ignores extra whitespace when normalizing", () => {
      const normalResult = lookupPrice("chicken breast");
      const extraSpaceResult = lookupPrice("  chicken  breast  ");

      expect(extraSpaceResult).toEqual(normalResult);
      expect(extraSpaceResult?.estimatedPriceEur).toBe(5.49);
    });

    it("finds partial match when ingredient name includes dataset name", () => {
      // "boneless chicken breast fillet" includes "chicken breast"
      const result = lookupPrice("boneless chicken breast fillet");

      expect(result).toBeDefined();
      expect(result?.name).toBe("chicken breast");
      expect(result?.estimatedPriceEur).toBe(5.49);
    });

    it("returns null for unknown ingredient (e.g., 'unobtanium')", () => {
      const result = lookupPrice("unobtanium");

      expect(result).toBeNull();
    });

    it("matches known produce (e.g., 'onion' at 0.99 EUR/kg)", () => {
      const result = lookupPrice("onion");

      expect(result).toBeDefined();
      expect(result?.name).toBe("onion");
      expect(result?.estimatedPriceEur).toBe(0.99);
      expect(result?.unit).toBe("kg");
    });

    it("matches items with piece unit (e.g., 'cucumber' at 0.59 EUR/piece)", () => {
      const result = lookupPrice("cucumber");

      expect(result).toBeDefined();
      expect(result?.name).toBe("cucumber");
      expect(result?.estimatedPriceEur).toBe(0.59);
      expect(result?.unit).toBe("piece");
    });

    it("returns null for empty string", () => {
      const result = lookupPrice("");

      expect(result).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
      const result = lookupPrice("   ");

      expect(result).toBeNull();
    });
  });

  describe("estimateListTotal()", () => {
    it("returns 0 for empty array", () => {
      const total = estimateListTotal([]);

      expect(total).toBe(0);
    });

    it("calculates sum for items with matching units", () => {
      // onion: 0.99 EUR/kg, chicken breast: 5.49 EUR/kg
      const total = estimateListTotal([
        { name: "onion", quantity: 2, unit: "kg" },
        { name: "chicken breast", quantity: 1, unit: "kg" },
      ]);

      // (0.99 * 2) + (5.49 * 1) = 1.98 + 5.49 = 7.47
      expect(total).toBeCloseTo(7.47, 2);
    });

    it("skips items with unknown ingredients gracefully", () => {
      const total = estimateListTotal([
        { name: "onion", quantity: 1, unit: "kg" },
        { name: "unobtanium", quantity: 5, unit: "kg" }, // unknown
        { name: "chicken breast", quantity: 1, unit: "kg" },
      ]);

      // (0.99 * 1) + (5.49 * 1) = 6.48; unobtanium ignored
      expect(total).toBeCloseTo(6.48, 2);
    });

    it("handles items with mismatched units (counts as 1x price)", () => {
      const total = estimateListTotal([
        { name: "cucumber", quantity: 5, unit: "piece" }, // unit matches
        { name: "onion", quantity: 500, unit: "g" }, // unit mismatch: 500g != kg
      ]);

      // cucumber: 0.59 * 5 = 2.95
      // onion: unit mismatch, so only 1x price = 0.99
      // Total: 2.95 + 0.99 = 3.94
      expect(total).toBeCloseTo(3.94, 2);
    });

    it("skips items with quantity <= 0", () => {
      const total = estimateListTotal([
        { name: "onion", quantity: 1, unit: "kg" },
        { name: "chicken breast", quantity: 0, unit: "kg" }, // skip: qty = 0
        { name: "cucumber", quantity: -1, unit: "piece" }, // skip: qty < 0
      ]);

      // Only onion: 0.99 * 1 = 0.99
      expect(total).toBeCloseTo(0.99, 2);
    });

    it("skips items with invalid quantity (NaN, Infinity)", () => {
      const total = estimateListTotal([
        { name: "onion", quantity: 1, unit: "kg" },
        { name: "chicken breast", quantity: NaN, unit: "kg" },
        { name: "cucumber", quantity: Infinity, unit: "piece" },
      ]);

      // Only onion: 0.99 * 1 = 0.99
      expect(total).toBeCloseTo(0.99, 2);
    });

    it("case-insensitive when matching ingredient names", () => {
      const total = estimateListTotal([
        { name: "Onion", quantity: 1, unit: "kg" },
        { name: "CHICKEN BREAST", quantity: 1, unit: "kg" },
      ]);

      expect(total).toBeCloseTo(6.48, 2);
    });

    it("correctly multiplies price when quantities are fractional", () => {
      // 1.5kg of chicken breast at 5.49 EUR/kg = 8.235 EUR
      const total = estimateListTotal([
        { name: "chicken breast", quantity: 1.5, unit: "kg" },
      ]);

      expect(total).toBeCloseTo(8.235, 2);
    });

    it("handles complex mixed list with known/unknown and matching/unmatched units", () => {
      const total = estimateListTotal([
        { name: "chicken breast", quantity: 0.5, unit: "kg" }, // 5.49 * 0.5 = 2.745
        { name: "onion", quantity: 2, unit: "kg" }, // 0.99 * 2 = 1.98
        { name: "mystery herb", quantity: 10, unit: "g" }, // unknown, skip
        { name: "cucumber", quantity: 3, unit: "piece" }, // 0.59 * 3 = 1.77
        { name: "garlic", quantity: 500, unit: "g" }, // garlic is piece, so unit mismatch: 0.45 * 1 = 0.45
      ]);

      // 2.745 + 1.98 + 1.77 + 0.45 = 6.945
      expect(total).toBeCloseTo(6.945, 2);
    });
  });
});
