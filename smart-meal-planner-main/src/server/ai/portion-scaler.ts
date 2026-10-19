import type { Ingredient } from "~/server/ai/meal-plan-schema";

/**
 * The composition of a household: how many adults, children, and toddlers.
 */
export interface HouseholdComposition {
    adults: number;
    children: number;
    toddlers: number;
}

/**
 * Optional per-member-type portion multipliers.
 * If provided in a user's profile, these override the system defaults.
 */
export interface PortionMultipliers {
    adult: number;
    child: number;
    toddler: number;
}

/** System defaults (FR-4.1). */
const DEFAULT_MULTIPLIERS: PortionMultipliers = {
    adult: 1.0,
    child: 0.75,
    toddler: 0.5,
};

/**
 * Round `value` to the nearest `step`.
 */
function roundToNearest(value: number, step: number): number {
    return Math.round(value / step) * step;
}

/**
 * Apply FR-4.1 rounding rules:
 *  - qty > 1  → nearest 0.25
 *  - qty <= 1 → nearest 0.1
 */
export function applyRounding(qty: number): number {
    if (qty > 1) {
        return roundToNearest(qty, 0.25);
    }
    return roundToNearest(qty, 0.1);
}

/**
 * Calculate the total household multiplier from composition and per-type
 * multipliers.
 *
 * Example (defaults): 2 adults + 1 child + 1 toddler
 *   = 2×1.0 + 1×0.75 + 1×0.5 = 3.25
 */
export function calculateHouseholdMultiplier(
    household: HouseholdComposition,
    multipliers: PortionMultipliers = DEFAULT_MULTIPLIERS,
): number {
    return (
        household.adults * multipliers.adult +
        household.children * multipliers.child +
        household.toddlers * multipliers.toddler
    );
}

/**
 * Scale a list of ingredients for the given household composition.
 *
 * LLM-generated quantities are per-serving for one adult; this function
 * multiplies them by the total household factor and applies the rounding rules
 * from FR-4.1.
 *
 * @param ingredients      - Raw ingredient list from the LLM response.
 * @param household        - Household member counts.
 * @param customMultipliers - Optional profile-level overrides; if provided,
 *                            they replace the system defaults entirely.
 * @returns A new ingredient array with scaled quantities; all other fields
 *          are unchanged (no mutation).
 */
export function scaleIngredients(
    ingredients: Ingredient[],
    household: HouseholdComposition,
    customMultipliers?: PortionMultipliers | null,
): Ingredient[] {
    const multipliers = customMultipliers ?? DEFAULT_MULTIPLIERS;
    const factor = calculateHouseholdMultiplier(household, multipliers); // e.g. 10x

    return ingredients.map((ingredient) => {
        const qtyNum = Number(ingredient.quantity);
        const scaledQty = applyRounding(qtyNum * factor);
        const scaledPrice = ingredient.estPriceEuro * factor;

        return {
            ...ingredient,
            quantity: scaledQty,
            estPriceEuro: scaledPrice
        };
    });
}

