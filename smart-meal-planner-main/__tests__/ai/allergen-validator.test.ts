import { describe, expect, it } from "vitest";
import { AllergenViolationError } from "~/server/ai/errors";
import { validateAllergens } from "~/server/ai/allergen-validator";

describe("validateAllergens", () => {
  it("does not throw when no ingredient matches allergens", () => {
    expect(() =>
      validateAllergens(
        [{ name: "chicken breast" }, { name: "rice" }, { name: "spinach" }],
        ["peanuts"],
      ),
    ).not.toThrow();
  });

  it("throws AllergenViolationError for a direct allergen match", () => {
    try {
      validateAllergens([{ name: "roasted peanuts" }], ["peanuts"]);
      throw new Error("Expected validateAllergens to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AllergenViolationError);
      const violation = err as AllergenViolationError;
      expect(violation.violatingIngredients).toContain("peanuts");
    }
  });

  it("throws AllergenViolationError for a synonym match", () => {
    try {
      validateAllergens([{ name: "casein powder" }], ["milk"]);
      throw new Error("Expected validateAllergens to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AllergenViolationError);
      const violation = err as AllergenViolationError;
      expect(violation.violatingIngredients).toContain("milk");
    }
  });
});