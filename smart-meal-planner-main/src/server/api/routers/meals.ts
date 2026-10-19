/**
 * Lazy recipe detail retrieval ensures instructions are generated
 * on-demand and stored only when first requested.
 * Follow-up: Tightens the instruction prompt so generated steps are clearer,
 * bounded, and aligned to the provided recipe context.
 */
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { and, eq, ne } from "drizzle-orm";
import { meals } from "~/server/db/schema";
import type { db as DatabaseClient } from "~/server/db";
import { TRPCError } from "@trpc/server";
import z from "zod";
import {
    generatePlanForCurrentUser,
    PlanGenerateInputSchema,
} from "~/server/services/plan-generation.service";
import { estimateListTotal } from "~/server/services/ingredient-pricing.service";
import { simplifyRecipeSteps } from "~/server/services/recipe-simplifier.service";
import { generateRecipeInstructions } from "~/server/ai/recipe-instructions-generator";
import { buildMealHash } from "~/server/ai/meal-hash";
import { INSTRUCTIONS_PLACEHOLDER } from "~/server/ai/types";

function normalizeInstructions(value: string | null | undefined): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function parseIngredientsForInstructionGeneration(value: unknown): {
    quantity: number;
    unit: string;
    name: string;
}[] {
    let rawIngredients: unknown;
    if (typeof value === "string") {
        try {
            rawIngredients = JSON.parse(value) as unknown;
        } catch {
            return [];
        }
    } else {
        rawIngredients = value;
    }

    if (!Array.isArray(rawIngredients)) {
        return [];
    }

    return rawIngredients
        .map((ingredient) => {
            if (!ingredient || typeof ingredient !== "object") {
                return null;
            }

            const record = ingredient as Record<string, unknown>;
            const quantity = record.quantity;
            const unit = record.unit;
            const name = record.name;

            if (
                typeof quantity !== "number" ||
                !Number.isFinite(quantity) ||
                typeof unit !== "string" ||
                unit.trim().length === 0 ||
                typeof name !== "string" ||
                name.trim().length === 0
            ) {
                return null;
            }

            return {
                quantity,
                unit: unit.trim(),
                name: name.trim(),
            };
        })
        .filter((ingredient): ingredient is { quantity: number; unit: string; name: string } => Boolean(ingredient));
}

function parseIngredientsForPricing(value: unknown): {
    name: string;
    quantity: number;
    unit: string;
}[] {
    let rawIngredients: unknown;

    if (typeof value === "string") {
        try {
            rawIngredients = JSON.parse(value) as unknown;
        } catch {
            return [];
        }
    } else {
        rawIngredients = value;
    }

    if (!Array.isArray(rawIngredients)) {
        return [];
    }

    return rawIngredients
        .map((ingredient) => {
            if (!ingredient || typeof ingredient !== "object") {
                return null;
            }

            const record = ingredient as Record<string, unknown>;
            const name = typeof record.name === "string" ? record.name.trim() : "";
            const unit = typeof record.unit === "string" ? record.unit.trim() : "";

            let quantity = 0;
            if (typeof record.quantity === "number") {
                quantity = record.quantity;
            } else if (typeof record.quantity === "string") {
                quantity = Number(record.quantity);
            }

            if (!name || !unit || !Number.isFinite(quantity) || quantity <= 0) {
                return null;
            }

            return { name, unit, quantity };
        })
        .filter((ingredient): ingredient is { name: string; quantity: number; unit: string } => Boolean(ingredient));
}

async function ensureMealInstructions(ctx: {
    db: Pick<typeof DatabaseClient, "update" | "select">;
}, meal: {
    id: string;
    mealType: string;
    recipeName: string;
    ingredients: unknown;
    cookTimeMinutes: number;
    mealHash: string | null;
    instructions: string | null;
}): Promise<string> {
    const existingInstructions = normalizeInstructions(meal.instructions);
    if (
        existingInstructions &&
        existingInstructions !== INSTRUCTIONS_PLACEHOLDER
    ) {
        return existingInstructions;
    }

    const parsedIngredients = parseIngredientsForInstructionGeneration(meal.ingredients);

    const mealHash = meal.mealHash ?? buildMealHash(
        meal.recipeName,
        meal.mealType,
        parsedIngredients,
    );

    const matchingMeals = await ctx.db
        .select({ instructions: meals.instructions })
        .from(meals)
        .where(
            and(
                eq(meals.mealHash, mealHash),
                ne(meals.instructions, INSTRUCTIONS_PLACEHOLDER),
            ),
        )
        .limit(1);

    const reusableInstructions = normalizeInstructions(matchingMeals[0]?.instructions);
    if (reusableInstructions) {
        await ctx.db
            .update(meals)
            .set({ instructions: reusableInstructions, mealHash })
            .where(eq(meals.id, meal.id));

        return reusableInstructions;
    }

    const generatedInstructions = await generateRecipeInstructions({
        recipeName: meal.recipeName,
        mealType: meal.mealType,
        ingredients: parsedIngredients,
        cookTimeMinutes: meal.cookTimeMinutes,
    });

    const normalizedGeneratedInstructions = normalizeInstructions(generatedInstructions);
    if (!normalizedGeneratedInstructions) {
        throw new Error("Instruction generation returned an empty instructions field.");
    }

    await ctx.db
        .update(meals)
        .set({ instructions: normalizedGeneratedInstructions, mealHash })
        .where(eq(meals.id, meal.id));

    return normalizedGeneratedInstructions;
}

export const mealsRouter = createTRPCRouter({
    getRecipeDetail: protectedProcedure
        .input(z.object({ mealId: z.string() }))
        .query(async ({ ctx, input }) => {
            const meal = await ctx.db.query.meals.findFirst({
                where: eq(meals.id, input.mealId),
                with: {
                    day: {
                        with: {
                            plan: true,
                        },
                    },
                },
            });

            if (!meal) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Meal not found" });
            }

            if (meal.day?.plan?.userId !== ctx.session.user.id) {
                throw new TRPCError({ code: "FORBIDDEN" });
            }

            const cachedInstructions = normalizeInstructions(meal.instructions);
            if (
                cachedInstructions &&
                cachedInstructions !== INSTRUCTIONS_PLACEHOLDER
            ) {
                return {
                    mealId: meal.id,
                    recipeName: meal.recipeName,
                    instructions: cachedInstructions,
                };
            }

            try {
                const instructions = await ensureMealInstructions(ctx, {
                    id: meal.id,
                    mealType: meal.mealType,
                    recipeName: meal.recipeName,
                    ingredients: meal.ingredients,
                    cookTimeMinutes: meal.cookTimeMinutes,
                    mealHash: meal.mealHash,
                    instructions: meal.instructions,
                });

                return {
                    mealId: meal.id,
                    recipeName: meal.recipeName,
                    instructions,
                };
            } catch (error) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to generate recipe instructions. Please try again.",
                    cause: error,
                });
            }
        }),

    getById: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const meal = await ctx.db.query.meals.findFirst({
                where: eq(meals.id, input.id),
                with: {
                    day: {
                        with: {
                            plan: true,
                        },
                    },
                },
            });

            if (!meal) return null;

            if (meal.day?.plan?.userId !== ctx.session.user.id) {
                throw new TRPCError({ code: "FORBIDDEN" });
            }

            return meal;
        }),

    estimatedCost: protectedProcedure
        .input(z.object({ mealId: z.string() }))
        .query(async ({ ctx, input }) => {
            const meal = await ctx.db.query.meals.findFirst({
                where: eq(meals.id, input.mealId),
                with: {
                    day: {
                        with: {
                            plan: true,
                        },
                    },
                },
            });

            if (!meal) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Meal not found" });
            }

            if (meal.day?.plan?.userId !== ctx.session.user.id) {
                throw new TRPCError({ code: "FORBIDDEN" });
            }

            const ingredients = parseIngredientsForPricing(meal.ingredients);

            if (ingredients.length === 0) {
                return null;
            }

            const estimatedTotal = estimateListTotal(ingredients);

            return estimatedTotal > 0 ? estimatedTotal : null;
        }),

    simplifyRecipe: protectedProcedure
        .input(z.object({
            mealId: z.string(),
            maxCookTimeMinutes: z.number().min(5).max(60),
        }))
        .mutation(async ({ ctx, input }) => {
            const meal = await ctx.db.query.meals.findFirst({
                where: eq(meals.id, input.mealId),
                with: {
                    day: {
                        with: {
                            plan: true,
                        },
                    },
                },
            });

            if (!meal) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Meal not found" });
            }

            if (meal.day?.plan?.userId !== ctx.session.user.id) {
                throw new TRPCError({ code: "FORBIDDEN" });
            }

            let instructions: string;
            try {
                instructions = await ensureMealInstructions(ctx, {
                    id: meal.id,
                    mealType: meal.mealType,
                    recipeName: meal.recipeName,
                    ingredients: meal.ingredients,
                    cookTimeMinutes: meal.cookTimeMinutes,
                    mealHash: meal.mealHash,
                    instructions: meal.instructions,
                });
            } catch (error) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message:
                        "Recipe instructions are unavailable and could not be generated for simplification.",
                    cause: error,
                });
            }

            if (meal.cookTimeMinutes <= input.maxCookTimeMinutes) {
                return {
                    mealId: input.mealId,
                    instructions,
                    cookTimeMinutes: meal.cookTimeMinutes,
                    simplificationNotes: "Recipe already fits within the target time.",
                    alreadyFast: true,
                };
            }

            const simplified = await simplifyRecipeSteps(
                {
                    recipeName: meal.recipeName,
                    instructions,
                    cookTimeMinutes: meal.cookTimeMinutes,
                },
                input.maxCookTimeMinutes,
            );

            await ctx.db
                .update(meals)
                .set({
                    instructions: simplified.instructions,
                    cookTimeMinutes: simplified.cookTimeMinutes,
                })
                .where(eq(meals.id, input.mealId));

            return {
                mealId: input.mealId,
                ...simplified,
                alreadyFast: false,
            };
        }),

    generate: protectedProcedure
        .input(PlanGenerateInputSchema)
        .mutation(async ({ ctx, input }) => {
            return generatePlanForCurrentUser({ ctx, input });
        }),
});
