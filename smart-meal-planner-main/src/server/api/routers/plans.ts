/**
 * Regeneration endpoints persist short summaries and defer full
 * instructions so recipe details can be generated lazily.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
    getDislikedRecipes,
    getRecentMealNames,
} from "~/server/ai/feedback-exclusions";
import { buildMealHash } from "~/server/ai/meal-hash";
import type { DayMealSelection } from "~/server/ai/meal-plan-prompt";
import { validateAllergens } from "~/server/ai/allergen-validator";
import {
    AllergenViolationError,
    PLAN_GENERATION_REASONS,
    PlanGenerationError,
} from "~/server/ai/errors";
import { INSTRUCTIONS_PLACEHOLDER, type GenerationContext } from "~/server/ai/types";
import { fetchPixabayImage } from "~/server/ai/pixabay-image";
import { meals, plans, profiles } from "~/server/db/schema";
import { generateMealPlan } from "~/server/services/meal-generator.service";
import {
    createPlanShell,
    startDetachedGeneration,
} from "~/server/services/plan-generation.service";
import type { GenerateInput } from "~/server/services/meal-generator.service";

const PortionMultipliersSchema = z.object({
    adult: z.number().positive(),
    child: z.number().positive(),
    toddler: z.number().positive(),
});

const MealTypeSchema = z.enum(["breakfast", "lunch", "dinner"]);

const DayMealSelectionSchema = z.object({
    breakfast: z.boolean(),
    lunch: z.boolean(),
    dinner: z.boolean(),
});

const mealTypeRank: Record<string, number> = {
    breakfast: 0,
    lunch: 1,
    dinner: 2,
};

function mapPlanGenerationErrorToMessage(error: PlanGenerationError): string {
    switch (error.reason ?? error.code) {
        case PLAN_GENERATION_REASONS.ALLERGEN_VIOLATION:
            return "Could not generate a plan free of your allergens after 3 tries. Try reducing your allergen list or dislike list.";
        case PLAN_GENERATION_REASONS.SCHEMA_VALIDATION_FAILURE:
            return "The AI returned an unexpected response format. Please try again.";
        case PLAN_GENERATION_REASONS.EMPTY_OR_TRUNCATED_RESPONSE:
        case PLAN_GENERATION_REASONS.TOKEN_LIMIT_EXCEEDED:
            return "Too many meals requested at once. Try generating fewer days or meals per day.";
        case PLAN_GENERATION_REASONS.MODEL_TIMEOUT_OR_RATE_LIMIT:
            return "Generation service is busy. Please try again in a moment.";
        case PLAN_GENERATION_REASONS.CONSTRAINT_CONFLICT:
            return "Your constraints may be conflicting. Try removing one dietary filter.";
        case PLAN_GENERATION_REASONS.PROVIDER_ERROR:
        default:
            return "Meal generation service is temporarily unavailable for your current constraints. Please try again in a moment.";
    }
}

function buildDayMealSelection(
    dayMeals: Array<{ mealType: string }>,
): DayMealSelection {
    const selection: DayMealSelection = {
        breakfast: false,
        lunch: false,
        dinner: false,
    };

    for (const dayMeal of dayMeals) {
        if (dayMeal.mealType in selection) {
            selection[dayMeal.mealType as keyof DayMealSelection] = true;
        }
    }

    return selection;
}

function hasAtLeastOneSelectedMeal(selection: DayMealSelection): boolean {
    return selection.breakfast || selection.lunch || selection.dinner;
}

function mealSelectionFromMealsPerDay(mealsPerDay: number): DayMealSelection {
    if (mealsPerDay === 1) {
        return { breakfast: true, lunch: false, dinner: false };
    }

    if (mealsPerDay === 2) {
        // Deterministic default for 2 meals/day: breakfast + lunch.
        return { breakfast: true, lunch: true, dinner: false };
    }

    return { breakfast: true, lunch: true, dinner: true };
}

function coerceValidDate(value: unknown): Date | null {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
}

function buildGenerateInputFromProfile(params: {
    db: any;
    userId: string;
    profile: {
        adults: number;
        children: number;
        toddlers: number;
        dietTypes: string[];
        allergens: string[];
        dislikes: string[];
        weeklyBudgetEuro: number;
    };
    planDays: number;
    mealSelection: Record<string, DayMealSelection>;
    portionMultipliers: { adult: number; child: number; toddler: number } | null;
    generationContext?: GenerationContext;
}): GenerateInput {
    return {
        db: params.db,
        userId: params.userId,
        household: {
            adults: params.profile.adults,
            children: params.profile.children,
            toddlers: params.profile.toddlers,
        },
        dietTypes: params.profile.dietTypes,
        allergens: params.profile.allergens,
        dislikes: params.profile.dislikes,
        weeklyBudgetEuro: params.profile.weeklyBudgetEuro,
        planDays: params.planDays,
        mealSelection: params.mealSelection,
        portionMultipliers: params.portionMultipliers,
        generationContext: params.generationContext,
    };
}

async function buildGenerationContext(input: {
    db: any;
    userId: string;
    profile: {
        adults: number;
        children: number;
        toddlers: number;
        dietTypes: string[];
        allergens: string[];
        dislikes: string[];
        weeklyBudgetEuro: number;
    };
}): Promise<GenerationContext> {
    const [dislikedRecipes, recentMealNames] = await Promise.all([
        getDislikedRecipes(input.db, input.userId),
        getRecentMealNames(input.db, input.userId, 21),
    ]);

    return {
        dislikedRecipes,
        recentMealNames,
        profileSnapshot: {
            adults: input.profile.adults,
            children: input.profile.children,
            toddlers: input.profile.toddlers,
            dietTypes: input.profile.dietTypes,
            allergens: input.profile.allergens,
            dislikes: input.profile.dislikes,
            weeklyBudgetEuro: input.profile.weeklyBudgetEuro,
        },
    };
}

async function getGenerationContext(
    ctx: { db: any; session: { user: { id: string } } },
) {
    const userId = ctx.session.user.id;

    const profile = await ctx.db.query.profiles.findFirst({
        where: eq(profiles.userId, userId),
    });

    if (!profile) {
        throw new TRPCError({
            code: "NOT_FOUND",
            message: "Profile not found. Please complete your household profile first.",
        });
    }

    const parsedMultipliers =
        profile.portionMultipliers == null
            ? null
            : PortionMultipliersSchema.safeParse(profile.portionMultipliers);

    if (parsedMultipliers && !parsedMultipliers.success) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message:
                "Invalid portion multipliers in profile. Please update your household settings.",
        });
    }

    const activePlan = await ctx.db.query.plans.findFirst({
        where: (plan: any, { and, eq }: { and: any; eq: any }) =>
            and(eq(plan.userId, userId), eq(plan.isActive, true)),
        orderBy: (plan: any, { desc }: { desc: any }) => [desc(plan.createdAt)],
        with: {
            days: {
                with: {
                    meals: true,
                },
            },
        },
    });

    if (!activePlan) {
        throw new TRPCError({
            code: "NOT_FOUND",
            message: "No active plan found. Generate a plan first.",
        });
    }

    return {
        userId,
        profile,
        activePlan,
        portionMultipliers:
            parsedMultipliers && parsedMultipliers.success
                ? parsedMultipliers.data
                : null,
    };
}

export const plansRouter = createTRPCRouter({
    getActivePlan: protectedProcedure.query(async ({ ctx }) => {
        const userId = ctx.session.user.id;

        const newestActivePlan = await ctx.db.query.plans.findFirst({
            where: (plan, { and, eq }) =>
                and(eq(plan.userId, userId), eq(plan.isActive, true)),
            orderBy: (plan, { desc }) => [desc(plan.createdAt)],
            with: {
                days: {
                    with: {
                        meals: true,
                    },
                },
            },
        });

        const selectedPlan =
            newestActivePlan ??
            (await ctx.db.query.plans.findFirst({
                where: (plan, { eq }) => eq(plan.userId, userId),
                orderBy: (plan, { desc }) => [desc(plan.createdAt)],
                with: {
                    days: {
                        with: {
                            meals: true,
                        },
                    },
                },
            }));

        if (!selectedPlan) {
            return null;
        }

        const resolvedStartDate =
            coerceValidDate(selectedPlan.startDate) ?? selectedPlan.createdAt;

        return {
            id: selectedPlan.id,
            planDays: selectedPlan.planDays,
            generationStatus: selectedPlan.generationStatus,
            startDate: resolvedStartDate.toISOString(),
            isActive: selectedPlan.isActive,
            createdAt: selectedPlan.createdAt.toISOString(),
            days: [...selectedPlan.days]
                .sort((a, b) => a.dayNumber - b.dayNumber)
                .map((day) => ({
                    id: day.id,
                    dayNumber: day.dayNumber,
                    meals: [...day.meals]
                        .sort((a, b) => {
                            const rankDiff =
                                (mealTypeRank[a.mealType] ?? Number.MAX_SAFE_INTEGER) -
                                (mealTypeRank[b.mealType] ?? Number.MAX_SAFE_INTEGER);

                            if (rankDiff !== 0) {
                                return rankDiff;
                            }

                            return a.recipeName.localeCompare(b.recipeName);
                        })
                        .map((meal) => ({
                            id: meal.id,
                            mealType: meal.mealType,
                            recipeName: meal.recipeName,
                            imageUrl: meal.imageUrl,
                            ingredients: meal.ingredients,
                            instructions: meal.instructions,
                            cookTimeMinutes: meal.cookTimeMinutes,
                        })),
                })),
        };
    }),

    getHistory: protectedProcedure
        .input(
            z.object({
                limit: z.number().min(1).max(50).default(6),
                offset: z.number().min(0).default(0),
            }),
        )
        .query(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;

            const archivedPlansCountResult = await ctx.db
                .select({ total: sql<number>`count(*)::int` })
                .from(plans)
                .where(and(eq(plans.userId, userId), eq(plans.isActive, false)));

            const total = archivedPlansCountResult[0]?.total ?? 0;

            const historyPlans = await ctx.db.query.plans.findMany({
                where: (plan: any, { and, eq }: { and: any; eq: any }) =>
                    and(eq(plan.userId, userId), eq(plan.isActive, false)),
                orderBy: (plan: any, { desc }: { desc: any }) => [desc(plan.createdAt)],
                limit: input.limit,
                offset: input.offset,
                with: {
                    days: {
                        with: {
                            meals: true,
                        },
                    },
                },
            });

            const plansHistory = historyPlans.map((plan: any) => {
                const createdAtDate = coerceValidDate(plan.createdAt);
                if (!createdAtDate) {
                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: "Invalid plan timestamp data.",
                    });
                }

                const startDateDate = coerceValidDate(plan.startDate);
                const mealCount = plan.days.reduce(
                    (total: number, day: any) => total + day.meals.length,
                    0,
                );

                return {
                    id: plan.id,
                    planDays: plan.planDays,
                    startDate: startDateDate ? startDateDate.toISOString() : null,
                    createdAt: createdAtDate.toISOString(),
                    mealCount,
                };
            });

            return {
                plans: plansHistory,
                total,
            };
        }),

    getHistoryPlanById: protectedProcedure
        .input(
            z.object({
                planId: z.string(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;

            const archivedPlan = await ctx.db.query.plans.findFirst({
                where: (plan, { and, eq }) =>
                    and(
                        eq(plan.id, input.planId),
                        eq(plan.userId, userId),
                        eq(plan.isActive, false),
                    ),
                with: {
                    days: {
                        with: {
                            meals: true,
                        },
                    },
                },
            });

            if (!archivedPlan) {
                throw new TRPCError({ code: "NOT_FOUND" });
            }

            const createdAtDate = coerceValidDate(archivedPlan.createdAt);
            if (!createdAtDate) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Invalid plan timestamp data.",
                });
            }

            const resolvedStartDate =
                coerceValidDate(archivedPlan.startDate) ?? createdAtDate;
            const mealCount = archivedPlan.days.reduce(
                (total, day) => total + day.meals.length,
                0,
            );

            return {
                id: archivedPlan.id,
                planDays: archivedPlan.planDays,
                startDate: resolvedStartDate.toISOString(),
                createdAt: createdAtDate.toISOString(),
                mealCount,
                days: [...archivedPlan.days]
                    .sort((a, b) => a.dayNumber - b.dayNumber)
                    .map((day) => ({
                        id: day.id,
                        dayNumber: day.dayNumber,
                        meals: [...day.meals]
                            .sort((a, b) => {
                                const rankDiff =
                                    (mealTypeRank[a.mealType] ?? Number.MAX_SAFE_INTEGER) -
                                    (mealTypeRank[b.mealType] ?? Number.MAX_SAFE_INTEGER);

                                if (rankDiff !== 0) {
                                    return rankDiff;
                                }

                                return a.recipeName.localeCompare(b.recipeName);
                            })
                            .map((meal) => ({
                                id: meal.id,
                                mealType: meal.mealType,
                                recipeName: meal.recipeName,
                                imageUrl: meal.imageUrl,
                                cookTimeMinutes: meal.cookTimeMinutes,
                            })),
                    })),
            };
        }),

    restorePlan: protectedProcedure
        .input(
            z.object({
                planId: z.string(),
                acknowledgedAllergenRisk: z.boolean().default(false),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;

            const targetPlan = await ctx.db.query.plans.findFirst({
                where: (plan: any, { and, eq }: { and: any; eq: any }) =>
                    and(eq(plan.id, input.planId), eq(plan.userId, userId)),
                with: {
                    days: {
                        with: {
                            meals: true,
                        },
                    },
                },
            });

            if (!targetPlan) {
                throw new TRPCError({ code: "NOT_FOUND" });
            }

            if (targetPlan.isActive) {
                return { success: true as const, planId: targetPlan.id };
            }

            const profile = await ctx.db.query.profiles.findFirst({
                where: eq(profiles.userId, userId),
            });

            const allergens = profile?.allergens ?? [];
            const conflictingMealNames = new Set<string>();

            for (const day of targetPlan.days) {
                for (const meal of day.meals) {
                    const ingredients = Array.isArray(meal.ingredients)
                        ? meal.ingredients
                              .filter(
                                  (ingredient): ingredient is { name: string } =>
                                      typeof ingredient === "object" &&
                                      ingredient !== null &&
                                      "name" in ingredient &&
                                      typeof (ingredient as { name: unknown }).name ===
                                          "string",
                              )
                              .map((ingredient) => ({ name: ingredient.name }))
                        : [];

                    try {
                        validateAllergens(ingredients, allergens);
                    } catch (error) {
                        if (error instanceof AllergenViolationError) {
                            conflictingMealNames.add(meal.recipeName);
                            continue;
                        }

                        throw error;
                    }
                }
            }

            if (conflictingMealNames.size > 0 && !input.acknowledgedAllergenRisk) {
                return {
                    success: false as const,
                    requiresAllergenConfirmation: true as const,
                    conflictingSummary: Array.from(conflictingMealNames).join(", "),
                };
            }

            await ctx.db.transaction(async (tx) => {
                await tx
                    .update(plans)
                    .set({ isActive: false })
                    .where(and(eq(plans.userId, userId), eq(plans.isActive, true)));

                await tx
                    .update(plans)
                    .set({ isActive: true })
                    .where(and(eq(plans.id, targetPlan.id), eq(plans.userId, userId)));
            });

            return { success: true as const, planId: targetPlan.id };
        }),

    swapMeal: protectedProcedure
        .input(
            z.object({
                dayNumber: z.number().int().min(1).max(7),
                mealType: MealTypeSchema,
                hint: z.string().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { userId, profile, activePlan, portionMultipliers } =
                await getGenerationContext(ctx);

            const generationContext = await buildGenerationContext({
                db: ctx.db,
                userId,
                profile,
            });

            const targetDay = activePlan.days.find(
                (planDay: any) => planDay.dayNumber === input.dayNumber,
            );

            if (!targetDay) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: `Day ${input.dayNumber} was not found in the active plan.`,
                });
            }

            const existingMeal = targetDay.meals.find(
                (dayMeal: any) => dayMeal.mealType === input.mealType,
            );

            if (!existingMeal) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `No ${input.mealType} meal exists for day ${input.dayNumber}.`,
                });
            }

            const mealSelection: DayMealSelection = {
                breakfast: false,
                lunch: false,
                dinner: false,
            };
            mealSelection[input.mealType] = true;

            const generateInput = buildGenerateInputFromProfile({
                db: ctx.db,
                userId,
                profile,
                planDays: 1,
                mealSelection: { "1": mealSelection },
                portionMultipliers,
                generationContext,
            });

            if (input.hint) {
                generateInput.hints = { "1": input.hint };
            }

            let generatedPlan;
            try {
                generatedPlan = await generateMealPlan(generateInput);
            } catch (error) {
                if (error instanceof PlanGenerationError) {
                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: mapPlanGenerationErrorToMessage(error),
                        cause: error,
                    });
                }
                throw error;
            }

            const replacementMeal = generatedPlan.days[0]?.meals.find(
                (dayMeal) => dayMeal.mealType === input.mealType,
            );

            if (!replacementMeal) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Meal generation did not return a replacement meal.",
                });
            }

            const replacementImageUrl =
                (await fetchPixabayImage(replacementMeal.recipeName)) ?? null;

            const insertedMeal = await ctx.db.transaction(async (tx) => {
                await tx
                    .delete(meals)
                    .where(
                        and(eq(meals.dayId, targetDay.id), eq(meals.mealType, input.mealType)),
                    );

                const created = await tx
                    .insert(meals)
                    .values({
                        dayId: targetDay.id,
                        mealType: input.mealType,
                        recipeName: replacementMeal.recipeName,
                        imageUrl: replacementImageUrl,
                        ingredients: replacementMeal.ingredients,
                        shortSummary: replacementMeal.shortSummary,
                        instructions: INSTRUCTIONS_PLACEHOLDER,
                        mealHash: buildMealHash(
                            replacementMeal.recipeName,
                            input.mealType,
                            replacementMeal.ingredients,
                        ),
                        cookTimeMinutes: replacementMeal.cookTimeMinutes,
                    })
                    .returning({ id: meals.id });

                return created[0];
            });

            return {
                success: true,
                planId: activePlan.id,
                dayNumber: input.dayNumber,
                mealType: input.mealType,
                mealId: insertedMeal?.id ?? existingMeal.id,
            };
        }),

    regenerateDay: protectedProcedure
        .input(
            z.object({
                dayNumber: z.number().int().min(1).max(7),
                hint: z.string().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { userId, profile, activePlan, portionMultipliers } =
                await getGenerationContext(ctx);

            const generationContext = await buildGenerationContext({
                db: ctx.db,
                userId,
                profile,
            });

            const targetDay = activePlan.days.find(
                (planDay: any) => planDay.dayNumber === input.dayNumber,
            );

            if (!targetDay) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: `Day ${input.dayNumber} was not found in the active plan.`,
                });
            }

            const daySelection = buildDayMealSelection(targetDay.meals);
            if (!hasAtLeastOneSelectedMeal(daySelection)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `Day ${input.dayNumber} has no meal slots to regenerate.`,
                });
            }

            const generateInput = buildGenerateInputFromProfile({
                db: ctx.db,
                userId,
                profile,
                planDays: 1,
                mealSelection: { "1": daySelection },
                portionMultipliers,
                generationContext,
            });

            if (input.hint) {
                generateInput.hints = { "1": input.hint };
            }

            let generatedPlan;
            try {
                generatedPlan = await generateMealPlan(generateInput);
            } catch (error) {
                if (error instanceof PlanGenerationError) {
                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: mapPlanGenerationErrorToMessage(error),
                        cause: error,
                    });
                }
                throw error;
            }

            const generatedDay = generatedPlan.days[0];
            if (!generatedDay) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Meal generation did not return any day data.",
                });
            }

            const expectedMealTypes = new Set<keyof DayMealSelection>();
            if (daySelection.breakfast) expectedMealTypes.add("breakfast");
            if (daySelection.lunch) expectedMealTypes.add("lunch");
            if (daySelection.dinner) expectedMealTypes.add("dinner");

            const replacementMeals = generatedDay.meals.filter((generatedMeal) =>
                expectedMealTypes.has(generatedMeal.mealType),
            );

            const enrichedReplacementMeals = await Promise.all(
                replacementMeals.map(async (replacementMeal) => ({
                    ...replacementMeal,
                    imageUrl: (await fetchPixabayImage(replacementMeal.recipeName)) ?? null,
                })),
            );

            const insertedMeals = await ctx.db.transaction(async (tx) => {
                await tx.delete(meals).where(eq(meals.dayId, targetDay.id));

                if (enrichedReplacementMeals.length === 0) {
                    return [] as Array<{ id: string }>;
                }

                return tx
                    .insert(meals)
                    .values(
                        enrichedReplacementMeals.map((replacementMeal) => ({
                            dayId: targetDay.id,
                            mealType: replacementMeal.mealType,
                            recipeName: replacementMeal.recipeName,
                            imageUrl: replacementMeal.imageUrl,
                            ingredients: replacementMeal.ingredients,
                            shortSummary: replacementMeal.shortSummary,
                            instructions: INSTRUCTIONS_PLACEHOLDER,
                            mealHash: buildMealHash(
                                replacementMeal.recipeName,
                                replacementMeal.mealType,
                                replacementMeal.ingredients,
                            ),
                            cookTimeMinutes: replacementMeal.cookTimeMinutes,
                        })),
                    )
                    .returning({ id: meals.id });
            });

            return {
                success: true,
                planId: activePlan.id,
                dayNumber: input.dayNumber,
                replacedMeals: insertedMeals.length,
            };
        }),

    regenerateFull: protectedProcedure
        .input(
            z
                .object({
                    planDays: z.number().int().min(1).max(7).optional(),
                    mealsPerDay: z.number().int().min(1).max(3).optional(),
                    mealSelection: z.record(z.string(), DayMealSelectionSchema).optional(),
                })
                .optional(),
        )
        .mutation(async ({ ctx, input }) => {
            const { userId, profile, activePlan, portionMultipliers } =
                await getGenerationContext(ctx);

            const currentMealSelectionByDay = Object.fromEntries(
                activePlan.days.map((planDay: any) => [
                    planDay.dayNumber.toString(),
                    buildDayMealSelection(planDay.meals),
                ]),
            ) as Record<string, DayMealSelection>;

            const hasOverrides =
                input != null &&
                (input.planDays != null ||
                    input.mealsPerDay != null ||
                    input.mealSelection != null);
            const isLegacyRegeneration = !hasOverrides;

            const planDays = input?.planDays ?? activePlan.planDays;

            let mealSelection: Record<string, DayMealSelection>;
            if (isLegacyRegeneration) {
                mealSelection = currentMealSelectionByDay;
            } else {
                const defaultSelectionFromMealsPerDay =
                    input?.mealsPerDay == null
                        ? null
                        : mealSelectionFromMealsPerDay(input.mealsPerDay);

                mealSelection = {};
                for (let day = 1; day <= planDays; day++) {
                    const dayKey = String(day);
                    const explicitSelection = input?.mealSelection?.[dayKey];

                    mealSelection[dayKey] =
                        explicitSelection ??
                        defaultSelectionFromMealsPerDay ??
                        currentMealSelectionByDay[dayKey] ?? {
                            breakfast: true,
                            lunch: true,
                            dinner: true,
                        };
                }
            }

            if (Object.values(mealSelection).every((day) => !hasAtLeastOneSelectedMeal(day))) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Active plan has no meal slots to regenerate.",
                });
            }

            await ctx.db
                .update(plans)
                .set({ isActive: false })
                .where(
                    and(
                        eq(plans.id, activePlan.id),
                        eq(plans.userId, userId),
                        eq(plans.isActive, true),
                    ),
                );

            const planId = await createPlanShell({
                db: ctx.db,
                userId,
                planDays,
                archiveExistingActive: false,
            });

            startDetachedGeneration({
                db: ctx.db,
                userId,
                planId,
                planDays,
                mealSelection,
                household: {
                    adults: profile.adults,
                    children: profile.children,
                    toddlers: profile.toddlers,
                },
                dietTypes: profile.dietTypes,
                allergens: profile.allergens,
                dislikes: profile.dislikes,
                weeklyBudgetEuro: profile.weeklyBudgetEuro,
                portionMultipliers,
            });

            return {
                planId,
                requestedDays: planDays,
                streamUrl: `/api/generation/stream?planId=${planId}`,
            };
        }),
});
