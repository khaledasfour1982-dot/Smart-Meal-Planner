import ingredientPricesRaw from "~/data/ingredient-prices.json";

export interface PriceEntry {
  name: string;
  category: string;
  unit: string;
  estimatedPriceEur: number;
  typicalStore: string;
}

type NormalizedPriceEntry = PriceEntry & {
  normalizedName: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isPriceEntry(value: unknown): value is PriceEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.name === "string" &&
    typeof record.category === "string" &&
    typeof record.unit === "string" &&
    typeof record.estimatedPriceEur === "number" &&
    Number.isFinite(record.estimatedPriceEur) &&
    typeof record.typicalStore === "string"
  );
}

const PRICE_ENTRIES: NormalizedPriceEntry[] = Array.isArray(ingredientPricesRaw)
  ? ingredientPricesRaw
      .filter(isPriceEntry)
      .map((entry) => ({
        ...entry,
        normalizedName: normalize(entry.name),
      }))
  : [];

function toPriceEntry(entry: NormalizedPriceEntry): PriceEntry {
  return {
    name: entry.name,
    category: entry.category,
    unit: entry.unit,
    estimatedPriceEur: entry.estimatedPriceEur,
    typicalStore: entry.typicalStore,
  };
}

export function lookupPrice(ingredientName: string): PriceEntry | null {
  const normalizedIngredient = normalize(ingredientName);

  if (!normalizedIngredient) {
    return null;
  }

  const exactMatch = PRICE_ENTRIES.find(
    (entry) => entry.normalizedName === normalizedIngredient,
  );
  if (exactMatch) {
    return toPriceEntry(exactMatch);
  }

  const includesDatasetNameMatch = PRICE_ENTRIES.find((entry) =>
    normalizedIngredient.includes(entry.normalizedName),
  );
  if (includesDatasetNameMatch) {
    return toPriceEntry(includesDatasetNameMatch);
  }

  const datasetNameIncludesMatch = PRICE_ENTRIES.find((entry) =>
    entry.normalizedName.includes(normalizedIngredient),
  );
  if (datasetNameIncludesMatch) {
    return toPriceEntry(datasetNameIncludesMatch);
  }

  return null;
}

export function estimateListTotal(
  items: { name: string; quantity: number; unit: string }[],
): number {
  let total = 0;

  for (const item of items) {
    const match = lookupPrice(item.name);

    if (!match) {
      continue;
    }

    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      continue;
    }

    if (normalize(item.unit) === normalize(match.unit)) {
      total += match.estimatedPriceEur * item.quantity;
      continue;
    }

    total += match.estimatedPriceEur;
  }

  return total;
}
