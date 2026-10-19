import { z } from "zod";
import { createJsonCompletion } from "~/server/services/ai-provider.service";

const AISLE_CATEGORIES = [
  "Produce",
  "Meat & Fish",
  "Dairy & Eggs",
  "Pasta",
  "Rice & Grains",
  "Canned & Jarred",
  "Frozen",
  "Bakery",
  "Condiments & Sauces",
  "Oils & Vinegars",
  "Spices & Seasonings",
  "Snacks & Sweets",
  "Beverages",
  "Other",
] as const;

const AisleCategorizationPayloadSchema = z.object({
  categories: z.record(z.string(), z.string()),
});

const categoryLookup = Object.fromEntries(
  AISLE_CATEGORIES.map((category) => [category.toLowerCase(), category]),
) as Record<string, (typeof AISLE_CATEGORIES)[number]>;

function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase();
}

function toCanonicalCategory(rawCategory: string): (typeof AISLE_CATEGORIES)[number] {
  const normalized = rawCategory.trim().toLowerCase();
  return categoryLookup[normalized] ?? "Other";
}

function buildFallbackMap(normalizedIngredientNames: string[]): Record<string, string> {
  return Object.fromEntries(
    normalizedIngredientNames.map((name) => [name, "Other"]),
  );
}

export async function categorizeIngredients(ingredientNames: string[]): Promise<Record<string, string>> {
  const normalizedIngredientNames = Array.from(
    new Set(
      ingredientNames
        .map(normalizeIngredientName)
        .filter((name) => name.length > 0),
    ),
  );

  if (normalizedIngredientNames.length === 0) {
    return {};
  }

  const fallbackMap = buildFallbackMap(normalizedIngredientNames);

  const completion = await createJsonCompletion({
    systemPrompt: `You categorize grocery ingredients into supermarket aisles.
Return JSON only in this exact shape:
{"categories":{"ingredient name":"Category"}}

Allowed categories (must match exactly):
- Produce
- Meat & Fish
- Dairy & Eggs
- Pasta
- Rice & Grains
- Canned & Jarred
- Frozen
- Bakery
- Condiments & Sauces
- Oils & Vinegars
- Spices & Seasonings
- Snacks & Sweets
- Beverages
- Other

Rules:
- Use only the allowed categories above.
- Keep keys as ingredient names.
- Do not include any explanation text or extra keys.`,
    userMessage: `Categorize these ingredients in a single batch:\n${normalizedIngredientNames.join("\n")}`,
  });

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(completion.content) as unknown;
  } catch {
    return fallbackMap;
  }

  const validated = AisleCategorizationPayloadSchema.safeParse(parsedJson);
  if (!validated.success) {
    return fallbackMap;
  }

  const categorized: Record<string, string> = { ...fallbackMap };

  for (const [rawIngredientName, rawCategory] of Object.entries(validated.data.categories)) {
    const normalizedName = normalizeIngredientName(rawIngredientName);
    if (!(normalizedName in categorized)) {
      continue;
    }

    categorized[normalizedName] = toCanonicalCategory(rawCategory);
  }

  return categorized;
}