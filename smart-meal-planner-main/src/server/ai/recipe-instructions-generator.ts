import { z } from "zod";
import { createJsonCompletion } from "~/server/services/ai-provider.service";

const RecipeInstructionsPayloadSchema = z.object({
  instructions: z.string().min(1),
});

const StepLineSchema = z
  .string()
  .trim()
  .regex(/^\d+\.\s+.+$/, "Each step must be numbered (e.g. '1. Prep ingredients').");

const StepArraySchema = z
  .array(StepLineSchema)
  .min(1, "At least one instruction step is required.")
  .max(8, "Instruction output must contain at most 8 steps.");

const IngredientSchema = z.object({
  quantity: z.number().positive(),
  unit: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

function parseInstructionSteps(rawInstructions: string): string[] {
  const normalized = rawInstructions.replace(/\r/g, "").trim();
  if (!normalized) {
    return [];
  }

  const lineSplitSteps = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lineSplitSteps.every((line) => /^\d+\.\s+.+$/.test(line))) {
    return lineSplitSteps;
  }

  const inlineSteps = normalized
    .match(/\d+\.\s+[^\n]+?(?=\s+\d+\.\s+|$)/g)
    ?.map((step) => step.trim()) ?? [];

  return inlineSteps;
}

function ensureSequentialStepNumbers(steps: string[]): string[] {
  steps.forEach((step, index) => {
    const numberMatch = step.match(/^(\d+)\./);
    const expectedNumber = index + 1;
    const actualNumber = Number(numberMatch?.[1]);

    if (actualNumber !== expectedNumber) {
      throw new Error("Instruction steps must start at 1 and increase sequentially.");
    }
  });

  return steps;
}

export async function generateRecipeInstructions(meal: {
  recipeName: string;
  mealType: string;
  ingredients: { quantity: number; unit: string; name: string }[];
  cookTimeMinutes: number;
}): Promise<string> {
  const ingredients = z.array(IngredientSchema).parse(meal.ingredients);

  const ingredientContext = ingredients
    .map((ingredient) => `${ingredient.quantity} ${ingredient.unit} ${ingredient.name}`.trim())
    .join("\n");

  const completion = await createJsonCompletion({
    systemPrompt: `You are a concise home-cooking assistant.
Return only valid JSON with this exact shape: {"instructions":"string"}.
Generate practical cooking instructions for the recipe context provided.
Constraints:
- Instructions must be plain numbered steps only
- Maximum 8 steps
- One clear action per step
- Keep wording simple and family-friendly
- End with serving or plating guidance
Do not include markdown, headings, extra keys, or additional commentary.`,
    userMessage: `Recipe name: ${meal.recipeName}
  Meal type: ${meal.mealType}
Cook time (minutes): ${meal.cookTimeMinutes}
Ingredients:\n${ingredientContext || "(not provided)"}

Return JSON only.`,
  });

  const parsed = JSON.parse(completion.content) as unknown;
  const payload = RecipeInstructionsPayloadSchema.parse(parsed);

  const steps = ensureSequentialStepNumbers(
    StepArraySchema.parse(parseInstructionSteps(payload.instructions)),
  );

  return steps.join("\n");
}
