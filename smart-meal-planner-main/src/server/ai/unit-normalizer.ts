export const UNIT_NORMALIZER: Record<string, string> = {
  grams: "g", gram: "g",
  kilograms: "kg", kilogram: "kg",
  milliliters: "ml", millilitres: "ml", milliliter: "ml",
  liters: "L", litres: "L", liter: "L",
  pieces: "pcs", piece: "pcs", pc: "pcs",
  teaspoon: "tsp", teaspoons: "tsp",
  tablespoon: "tbsp", tablespoons: "tbsp",
  slices: "slice", cups: "cup",
};

export const ALLOWED_UNITS = [
  "g", "kg", "ml", "L", "tsp", "tbsp", "pcs", "slice", "cup",
] as const;

export type AllowedUnit = typeof ALLOWED_UNITS[number];

export const TO_BASE: Record<
  string,
  { baseUnit: "g" | "ml"; factor: number }
> = {
  g: { baseUnit: "g", factor: 1 },
  kg: { baseUnit: "g", factor: 1000 },
  ml: { baseUnit: "ml", factor: 1 },
  l: { baseUnit: "ml", factor: 1000 },
  cl: { baseUnit: "ml", factor: 10 },
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeUnit(rawUnit: string): string {
  const trimmed = rawUnit.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  const normalized = UNIT_NORMALIZER[trimmed.toLowerCase()];
  return normalized ?? trimmed;
}

function roundQuantity(value: number): number {
  return Number(value.toFixed(2));
}

export function toBaseUnit(quantity: number, unit: string): { quantity: number; unit: string } {
  const normalizedUnit = normalizeUnit(unit);
  const conversion = TO_BASE[normalizedUnit.toLowerCase()];

  if (!conversion) {
    return {
      quantity: roundQuantity(quantity),
      unit: normalizedUnit,
    };
  }

  return {
    quantity: roundQuantity(quantity * conversion.factor),
    unit: conversion.baseUnit,
  };
}

export type MergeableIngredient = {
  name: string;
  quantity: number | string;
  unit: string;
  category?: string;
};

export type MergedIngredient = {
  name: string;
  quantity: number;
  unit: string;
  category: string;
};

export function mergeIngredients(ingredients: MergeableIngredient[]): MergedIngredient[] {
  const totals = new Map<string, MergedIngredient>();

  for (const ingredient of ingredients) {
    const name = ingredient.name.trim();
    if (name.length === 0) {
      continue;
    }

    const parsedQuantity = toNumber(ingredient.quantity);
    if (parsedQuantity == null || parsedQuantity <= 0) {
      continue;
    }

    const { quantity: baseQuantity, unit: baseUnit } = toBaseUnit(
      parsedQuantity,
      ingredient.unit,
    );

    const key = `${name.toLowerCase()}::${baseUnit.toLowerCase()}`;
    const existing = totals.get(key);

    if (existing) {
      existing.quantity = roundQuantity(existing.quantity + baseQuantity);
      if (existing.category === "Other" && ingredient.category?.trim()) {
        existing.category = ingredient.category.trim();
      }
      continue;
    }

    totals.set(key, {
      name,
      quantity: baseQuantity,
      unit: baseUnit,
      category: ingredient.category?.trim() || "Other",
    });
  }

  return Array.from(totals.values())
    .map((ingredient) => {
      if (ingredient.unit === "g" && ingredient.quantity >= 1000) {
        return {
          ...ingredient,
          quantity: roundQuantity(ingredient.quantity / 1000),
          unit: "kg",
        };
      }

      if (ingredient.unit === "ml" && ingredient.quantity >= 1000) {
        return {
          ...ingredient,
          quantity: roundQuantity(ingredient.quantity / 1000),
          unit: "L",
        };
      }

      return ingredient;
    })
    .sort((left, right) => {
      const byName = left.name.localeCompare(right.name);
      if (byName !== 0) {
        return byName;
      }
      return left.unit.localeCompare(right.unit);
    });
}
