import { createJsonCompletion } from "~/server/services/ai-provider.service";
import { PlanGenerationError, PLAN_GENERATION_REASONS } from "~/server/ai/errors";

export interface SimplifyInput {
    recipeName: string;
    instructions: string;
    cookTimeMinutes: number;
}

export interface SimplifyResult {
    instructions: string;
    cookTimeMinutes: number;
    simplificationNotes: string;
}

export async function simplifyRecipeSteps(
    meal: SimplifyInput,
    maxCookTimeMinutes: number,
): Promise<SimplifyResult> {
    const systemPrompt = `You are a family cooking assistant helping a busy parent prepare faster meals.
When simplifying recipes:
- Combine steps where possible
- Suggest faster cooking methods (microwave, pre-cut veg, store-bought shortcuts)
- Remove non-essential or decorative steps
- Keep instructions family-friendly and clear
Always return valid JSON only.`;

    const userMessage = `Simplify this recipe to fit within ${maxCookTimeMinutes} minutes.

RECIPE: ${meal.recipeName}
CURRENT INSTRUCTIONS: ${meal.instructions}
CURRENT COOK TIME: ${meal.cookTimeMinutes} minutes

Return JSON only:
{
  "instructions": "simplified step-by-step instructions as a single string",
  "cookTimeMinutes": <number, must be <= ${maxCookTimeMinutes}>,
  "simplificationNotes": "one sentence on what was changed"
}`;

    let content: string;
    try {
        const result = await createJsonCompletion({ systemPrompt, userMessage });
        content = result.content.trim();
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        throw new PlanGenerationError(`Recipe simplification failed: ${message}`, {
            attempts: 1,
            reason: PLAN_GENERATION_REASONS.PROVIDER_ERROR,
            metadata: { step: "provider_request" },
        });
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(content) as unknown;
    } catch {
        throw new PlanGenerationError("Invalid JSON returned by model during simplification.", {
            attempts: 1,
            reason: PLAN_GENERATION_REASONS.SCHEMA_VALIDATION_FAILURE,
            metadata: { step: "json_parse" },
        });
    }

    const result = parsed as Record<string, unknown>;

    if (
        typeof result.instructions !== "string" ||
        typeof result.cookTimeMinutes !== "number" ||
        typeof result.simplificationNotes !== "string"
    ) {
        throw new PlanGenerationError("Simplification response missing required fields.", {
            attempts: 1,
            reason: PLAN_GENERATION_REASONS.SCHEMA_VALIDATION_FAILURE,
            metadata: { step: "schema_validation" },
        });
    }

    return {
        instructions: result.instructions,
        cookTimeMinutes: Math.min(result.cookTimeMinutes, maxCookTimeMinutes),
        simplificationNotes: result.simplificationNotes,
    };
}
