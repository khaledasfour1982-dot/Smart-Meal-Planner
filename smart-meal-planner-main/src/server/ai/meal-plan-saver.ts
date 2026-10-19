/**
 * Persists generated meal summaries and stores a lazy-load
 * placeholder so recipe details are generated on first open.
 */
import type { MealPlan } from "~/server/ai/meal-plan-schema";
import { buildMealHash } from "~/server/ai/meal-hash";
import { INSTRUCTIONS_PLACEHOLDER } from "~/server/ai/types";
import type { GenerateInput } from "~/server/services/meal-generator.service";
import { days, meals, plans } from "~/server/db/schema";
import { and, eq } from "drizzle-orm";

const isDev = process.env.NODE_ENV !== "production";

async function fetchPixabayImage(recipeName: string): Promise<string> {
    const query = recipeName
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join('+');

    const apiKey = process.env.PIXABAY_API_KEY;
    const fallback = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1200&auto=format&fit=crop";

    if (!apiKey) return fallback;

    try {
        const res = await fetch(
            `https://pixabay.com/api/?key=${apiKey}&q=${query}+food+dish&image_type=photo&category=food&per_page=10&safesearch=true&order=relevant` // ✅ +food+dish, per_page=10, order=relevant
        );
        const data = await res.json() as { hits: Array<{ webformatURL: string; tags: string }> };

        const recipeWords = recipeName.toLowerCase().split(/\s+/);
        const bestHit = data.hits.find(hit =>
            recipeWords.some(word => hit.tags.toLowerCase().includes(word))
        ) ?? data.hits[0];

        return bestHit?.webformatURL ?? fallback;
    } catch {
        return fallback;
    }
}

function isDirectImageUrl(url: string): boolean {
    return /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(url) ||
        url.includes('cdn.pixabay.com') ||
        url.includes('images.unsplash.com');
}

function normalizeImageUrl(imageUrl: unknown): string | null {
    if (typeof imageUrl !== "string") {
        return null;
    }

    const normalized = imageUrl.trim();
    return normalized.length > 0 ? normalized : null;
}

export async function saveMealPlanToDb(
    db: any,
    userId: string,
    planData: MealPlan,
    input: GenerateInput
) {
    if (isDev) {
        console.log("[meal-plan-saver] start", {
            planDays: input.planDays,
            daysInPayload: planData.days.length,
        });
    }

    const generationDate = new Date();

    await db
        .update(plans)
        .set({ isActive: false })
        .where(and(eq(plans.userId, userId), eq(plans.isActive, true)));

    const plan = await db.insert(plans).values({
        userId,
        planDays: input.planDays,
        startDate: generationDate,
        isActive: true,
    }).returning();
    const planId = plan[0].id;

    let totalMeals = 0;

    for (let dayNum = 1; dayNum <= input.planDays; dayNum++) {
        const dayData = planData.days[dayNum - 1];
        if (!dayData) throw new Error(`AI response missing day ${dayNum}`);

        const dayRecord = await db.insert(days).values({
            planId,
            dayNumber: dayNum
        }).returning();
        const dayId = dayRecord[0].id;

        const daySelection = input.mealSelection[dayNum.toString()] ?? {
            breakfast: true,
            lunch: true,
            dinner: true,
        };

        for (const meal of dayData.meals) {
            const rawType = meal.mealType ?? 'unknown';
            const normalizedType = rawType.trim().toLowerCase() as keyof typeof daySelection;

            if (!['breakfast', 'lunch', 'dinner'].includes(normalizedType)) {
                if (isDev) {
                    console.warn("[meal-plan-saver] skipped invalid meal type", {
                        dayNumber: dayNum,
                        rawMealType: rawType,
                    });
                }
                continue;
            }

            if (daySelection[normalizedType]) {
                const groqUrl = normalizeImageUrl((meal as { imageUrl?: unknown }).imageUrl);
                const imageUrl = (groqUrl && isDirectImageUrl(groqUrl))
                    ? groqUrl
                    : await fetchPixabayImage(meal.recipeName);

                await db.insert(meals).values({
                    dayId,
                    mealType: normalizedType,
                    recipeName: meal.recipeName,
                    imageUrl,
                    ingredients: JSON.stringify(meal.ingredients),
                    shortSummary: meal.shortSummary,
                    instructions: INSTRUCTIONS_PLACEHOLDER,
                    mealHash: buildMealHash(
                        meal.recipeName,
                        normalizedType,
                        meal.ingredients,
                    ),
                    cookTimeMinutes: meal.cookTimeMinutes,
                });
                totalMeals++;
            } else if (isDev) {
                console.log("[meal-plan-saver] skipped unselected meal slot", {
                    dayNumber: dayNum,
                    mealType: normalizedType,
                });
            }
        }
    }

    if (isDev) {
        console.log("[meal-plan-saver] done", {
            planId,
            totalMeals,
        });
    }
    return { planId, totalMeals };
}
