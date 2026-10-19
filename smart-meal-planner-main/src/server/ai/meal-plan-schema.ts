/**
 * Splits plan output into summary-vs-detail schemas so initial plan
 * generation stores only meal summaries while full instructions are loaded lazily.
 */
import { z } from "zod";
import { ALLOWED_UNITS, UNIT_NORMALIZER } from "./unit-normalizer";

const isDev = process.env.NODE_ENV !== "production";

function normalizePriceEstimate(raw: unknown, fieldName: "estPriceEuro" | "totalEstimatedCostEuro"): number {
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
        return raw;
    }

    if (isDev) {
        console.warn("[meal-generation] price_estimate_drift", {
            field: fieldName,
            providedValue: raw,
        });
    }

    return 0.01;
}

/**
 * Zod schema for a single recipe ingredient.
 * Matches the PRD §6 AI output spec exactly.
 */
export const IngredientSchema = z.object({
    name: z.string()
        .transform((name) => name.toLowerCase().trim()),
    quantity: z.number().positive(),
    unit: z.string().transform((u) => UNIT_NORMALIZER[u.toLowerCase().trim()] ?? u),
    category: z.enum(["Produce", "Dairy", "Meat", "Frozen", "Pantry", "Other"]),
    estPriceEuro: z.preprocess(
        (value) => normalizePriceEstimate(value, "estPriceEuro"),
        z.number().positive(),
    )

})
    .refine((ingredient) => {
        const { quantity: qtyNum, unit, name } = ingredient;

        const isEgg = /\beggs?\b/i.test(name);
        if (isEgg && unit === 'pcs') {
            return Number.isInteger(qtyNum);
        }

        return true;
    }, {
        message: "Eggs (pcs): whole numbers only."
    })
    .refine((ingredient) => {
        return (ALLOWED_UNITS as readonly string[]).includes(ingredient.unit);
    }, {
        message: `Invalid unit. Must be one of: ${ALLOWED_UNITS.join(", ")}`
    });

export type Ingredient = z.infer<typeof IngredientSchema>;


/**
 * Summary payload generated during plan creation (lazy instructions model).
 */
export const MealSummarySchema = z.object({
    mealType: z.enum(["breakfast", "lunch", "dinner"]),
    recipeName: z.string(),
    ingredients: z.array(IngredientSchema),
    cookTimeMinutes: z.number().int().positive(),
    shortSummary: z.string().max(150),
});
export type MealSummary = z.infer<typeof MealSummarySchema>;

/**
 * Detail payload used when generating full recipe instructions on demand.
 */
export const MealDetailSchema = z.object({
    recipeName: z.string(),
    instructions: z.string(),
});
export type MealDetail = z.infer<typeof MealDetailSchema>;

export type Meal = MealSummary;

/**
 * Zod schema for a single day in the plan.
 */
export const DaySchema = z.object({
    dayNumber: z.number().int().min(1).max(7),
    meals: z.array(MealSummarySchema),
    totalEstimatedCostEuro: z.preprocess(
        (value) => normalizePriceEstimate(value, "totalEstimatedCostEuro"),
        z.number().positive(),
    ),

});
export type Day = z.infer<typeof DaySchema>;

/**
 * Top-level Zod schema for the LLM response.
 * This is the source of truth for the shape the Groq LLM must return.
 */
export const MealPlanSchema = z.object({
    days: z.array(DaySchema),
});
export type MealPlan = z.infer<typeof MealPlanSchema>;

