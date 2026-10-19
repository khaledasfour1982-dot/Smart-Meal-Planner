import { createHash } from "node:crypto";

type HashableIngredient = {
  name: string;
  quantity: number | string;
  unit: string;
};

function normalizeString(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function buildMealHash(
  recipeName: string,
  mealType: string,
  ingredients: HashableIngredient[],
): string {
  const normalizedIngredients = ingredients
    .map((ingredient) => ({
      name: normalizeString(ingredient.name),
      quantity: normalizeString(ingredient.quantity),
      unit: normalizeString(ingredient.unit),
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(
      (ingredient) =>
        `${ingredient.name}|${ingredient.quantity}|${ingredient.unit}`,
    );

  const stablePayload = {
    recipeName: normalizeString(recipeName),
    mealType: normalizeString(mealType),
    ingredients: normalizedIngredients,
  };

  return createHash("sha256")
    .update(JSON.stringify(stablePayload))
    .digest("hex");
}
