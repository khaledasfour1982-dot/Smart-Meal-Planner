import { AllergenViolationError } from "~/server/ai/errors";

const SYNONYM_GROUPS: Record<string, string[]> = {
  milk: ["milk", "dairy", "cream", "butter", "cheese", "lactose", "casein", "whey"],
  peanuts: ["peanut", "peanuts", "groundnut", "groundnuts", "arachis"],
  "tree nuts": [
    "tree nut",
    "tree nuts",
    "almond",
    "almonds",
    "walnut",
    "walnuts",
    "hazelnut",
    "hazelnuts",
    "cashew",
    "cashews",
    "pistachio",
    "pistachios",
    "pecan",
    "pecans",
  ],
  gluten: ["gluten", "wheat", "rye", "barley", "spelt", "flour"],
  "cereals containing gluten": ["cereals containing gluten", "gluten", "wheat", "rye", "barley", "spelt", "flour"],
  eggs: ["egg", "eggs"],
  crustaceans: ["crustacean", "crustaceans", "shrimp", "prawn", "prawns", "crab", "lobster", "crayfish"],
  molluscs: ["mollusc", "molluscs", "squid", "octopus", "mussel", "mussels", "oyster", "oysters", "scallop", "scallops", "clam", "clams", "snail", "snails"],
  soybeans: ["soy", "soya", "soybean", "soybeans", "tofu", "edamame", "miso", "tempeh"],
  sulphites: ["sulphite", "sulphites", "sulfite", "sulfites", "sulphur", "sulfur", "so2", "e220", "e221", "e222", "e223", "e224"],
  celery: ["celery", "celeriac"],
  mustard: ["mustard"],
  sesame: ["sesame", "tahini", "sesame oil", "sesame seed"],
  lupin: ["lupin", "lupine", "lupin flour", "lupin seed"],
  fish: ["fish", "cod", "salmon", "tuna", "haddock", "anchovy", "anchovies", "sardine", "mackerel", "tilapia", "bass", "trout"],
};

/**
 * Normalize for matching: lowercase, trim, strip punctuation, collapse spaces.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function containsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`);
  return pattern.test(text);
}

function expandToCanonicalTerms(normalized: string): Set<string> {
  const candidates = new Set<string>([normalized]);

  for (const [canonical, synonyms] of Object.entries(SYNONYM_GROUPS)) {
    if (containsTerm(normalized, canonical)) {
      candidates.add(canonical);
      continue;
    }

    if (synonyms.some((synonym) => containsTerm(normalized, synonym))) {
      candidates.add(canonical);
    }
  }

  return candidates;
}

/**
 * Cross-check a list of ingredient names against the user's allergen list.
 *
 * Safety-critical (NFR-3): zero false negatives allowed.
 *
 * Algorithm:
 *  1. Normalize both ingredient names and allergens.
 *  2. Expand ingredient names through synonym map.
 *  3. For each expanded candidate, check if any allergen is a substring of
 *     the candidate OR the candidate is a substring of any allergen.
 *  4. If any match → collect and throw AllergenViolationError.
 *
 * IMPORTANT: Never log allergen or ingredient data in production.
 *
 * @param ingredients - Array of ingredient objects with at least a `name` field.
 * @param allergens   - The user's allergen list from their profile.
 * @throws {AllergenViolationError} if any ingredient matches any allergen.
 */
export function validateAllergens(
  ingredients: { name: string }[],
  allergens: string[],
): void {
  if (allergens.length === 0) return;

  const expandedAllergens = allergens.map((allergen) =>
    expandToCanonicalTerms(normalize(allergen)),
  );
  const violations = new Set<string>();
  const canonicalAllergens = new Set(Object.keys(SYNONYM_GROUPS));

  for (const ingredient of ingredients) {
    const normalizedIngredient = normalize(ingredient.name);
    const ingredientTerms = expandToCanonicalTerms(normalizedIngredient);
    let hasViolation = false;
    let matchedViolation = normalizedIngredient;

    for (const allergenTerms of expandedAllergens) {
      const directTermMatch = Array.from(allergenTerms).some(
        (term) =>
          containsTerm(normalizedIngredient, term) ||
          containsTerm(term, normalizedIngredient),
      );
      const synonymMatch = Array.from(allergenTerms).some((term) => ingredientTerms.has(term));

      if (directTermMatch || synonymMatch) {
        const canonicalMatch = Array.from(ingredientTerms).find((term) =>
          canonicalAllergens.has(term),
        );
        if (canonicalMatch) {
          matchedViolation = canonicalMatch;
        }

        hasViolation = true;
        break;
      }
    }

    if (hasViolation) {
      violations.add(matchedViolation);
    }
  }

  if (violations.size > 0) {
    throw new AllergenViolationError(Array.from(violations));
  }
}
