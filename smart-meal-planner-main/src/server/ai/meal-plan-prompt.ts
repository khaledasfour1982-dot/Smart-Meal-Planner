/**
 * Updates generation contract to emit meal summaries only; full
 * instructions are generated lazily via meals API when requested.
 */
/**
 * Extends prompt context with recently used meal names so the model
 * can avoid near-term repetition while preserving existing hard constraints.
 */

/**
 * Per-day meal selection: which slots should be included.
 */
export interface DayMealSelection {
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
}

/**
 * Household composition used to scale portions in the prompt context.
 */
export interface HouseholdComposition {
    adults: number;
    children: number;
    toddlers: number;
}

/**
 * All inputs needed to build a Groq prompt for meal plan generation.
 */
export interface PromptInput {
    household: HouseholdComposition;
    /** All diet types must be satisfied simultaneously (hard constraints). */
    dietTypes: string[];
    /** EU Annex II codes + optional free-text. Hard constraints. */
    allergens: string[];
    /** Soft preference exclusions. */
    dislikes: string[];
  /** Hard recipe exclusions from prior poor user ratings. */
  dislikedRecipes?: string[];
  /** Recent meal names to avoid repeating in newly generated plans. */
  recentMealNames?: string[];
    /** Number of days to plan (1–7). */
    planDays: number;
    /**
     * Per-day meal selection keyed by day number (1-indexed).
     * If a day is missing, all three slots default to true.
     */
    mealSelection: Record<string, DayMealSelection>;
    /**
     * Optional per-day hints (e.g., specific recipe names or ingredients).
     * Keyed by day number (1-indexed).
     */
    hints?: Record<string, string>;
    /**
     * Target weekly grocery budget in euros (Belgian/EU supermarket context).
     * Soft planning constraint — never overrides allergen or diet safety rules.
     * Omitted or zero means no budget instruction is sent.
     */
    weeklyBudgetEuro?: number;
}

/** The JSON schema description embedded in the system prompt. */
const JSON_SCHEMA_DESCRIPTION = `
{
  "days": [
    {
      "dayNumber": <integer 1–7>,
      "meals": [
        {
          "mealType": "<breakfast|lunch|dinner>",
          "recipeName": "<string>",
          "ingredients": [
            {
              "name": "<common English ingredient name>",
              "quantity": <positive number>,
              "unit": "MUST be exactly one of: g, kg, ml, L, tsp, tbsp, pcs, slice, cup",
              "category": "<Produce|Dairy|Meat|Frozen|Pantry|Other>",
              "estPriceEuro": <positive number>
            }
          ],
          "shortSummary": "<single sentence, max 150 chars>",
          "cookTimeMinutes": <positive integer>
        }
      ],
      "totalEstimatedCostEuro": <positive number>
    }
  ]
}`.trim();

const DIET_GUIDANCE: Partial<Record<string, string>> = {
  Halal: "Use a variety of halal proteins: chicken, beef, lamb, turkey, and fish. Do NOT rely only on chicken.",
  Vegan: "Use only plant-based proteins: legumes, tofu, tempeh, seitan, and whole grains.",
  Vegetarian: "Exclude meat and fish. Use eggs, dairy, legumes, and plant proteins.",
  Pescatarian: "Exclude meat. Fish and seafood are allowed alongside plant proteins.",
  GlutenFree: "Exclude all wheat, rye, barley, and spelt. Use rice, potato, corn, and certified gluten-free grains.",
  DairyFree: "Exclude all milk, cream, butter, cheese, and dairy derivatives.",
  LowCarb: "Minimize bread, pasta, rice, and sugar. Prioritize proteins, vegetables, and healthy fats.",
};

function buildPricingSection(weeklyBudgetEuro?: number): string {
    const budgetLine = weeklyBudgetEuro
        ? `- Weekly budget target (soft constraint): aim for <= EUR ${weeklyBudgetEuro.toFixed(2)} total. Do not violate diet/allergen hard constraints to hit budget.`
        : "- No explicit weekly budget target provided.";

    return `
PRICING REQUIREMENTS (canonical):
${budgetLine}
- Use the reference price table below as guidance for estimates.
- Include "estPriceEuro" for every ingredient as a positive number in euros for the listed quantity.
- Include "totalEstimatedCostEuro" for every day as the sum of that day's ingredient estimates.
- If exact pricing is uncertain, provide a realistic estimate from the table/context.
`;
}

/**
 * Build the system prompt that instructs the LLM on its role and constraints.
 */
function buildSystemPrompt(input: PromptInput): string {
    const dietSection =
        input.dietTypes.length > 0
      ? [
        "DIETARY REQUIREMENTS (hard constraints — ALL must be satisfied simultaneously):",
        ...input.dietTypes.map((d) => {
          const guidance = DIET_GUIDANCE[d];
          return guidance ? `  - ${d}: ${guidance}` : `  - ${d}`;
        }),
        "",
        "Vary proteins and ingredients across days. Do not repeat the same main protein more than twice in a 7-day plan.",
      ].join("\n")
            : "No specific dietary requirements.";

    const allergenSection =
        input.allergens.length > 0
            ? `ALLERGEN BLACKLIST (hard constraint — NEVER include any ingredient that contains or is derived from):
    ${input.allergens.map((a) => `  - ${a}`).join("\n")}
      Use only the most common, plain English ingredient names so allergen checks are unambiguous.`
            : "No allergen restrictions.";

    const dislikeSection =
        input.dislikes.length > 0
            ? `INGREDIENT DISLIKES (soft constraint — please avoid if possible, but do not sacrifice dietary completeness):
    ${input.dislikes.map((d) => `  - ${d}`).join("\n")}`
            : "No ingredient dislikes.";

    const dislikedRecipes = input.dislikedRecipes ?? [];
    const dislikedRecipesSection =
      dislikedRecipes.length > 0
        ? `RECIPE EXCLUSIONS (hard constraint):
    Never generate these recipes (user has rated them poorly):
    ${dislikedRecipes.map((recipe) => `  - ${recipe}`).join("\n")}`
        : "";

    const recentMealNames = input.recentMealNames ?? [];
    const recentMealNamesSection =
      recentMealNames.length > 0
        ? `RECENT MEALS (avoid repeats):
    Prefer different meal names than these recently generated meals:
    ${recentMealNames.map((mealName) => `  - ${mealName}`).join("\n")}`
        : "";


    const pricingSection = buildPricingSection(input.weeklyBudgetEuro);

    const quantityRules = `
    QUANTITY RULES - CRITICAL (violation = failure):
    - Eggs: WHOLE NUMBERS ONLY (6 eggs, never 6.7 or 7.2)
    - For ml ingredients, prefer multiples of 5 (e.g. 5, 10, 50, 75, 100, 250ml). Avoid arbitrary decimals.
    - Round ALL quantities to practical units before output
`;
    const ingredientExamples = `
    EXAMPLES (copy exactly):
    "eggs": {"quantity": 6, "unit": "pcs", "estPriceEuro": 1.68},
    "milk": {"quantity": 250, "unit": "ml", "estPriceEuro": 0.36},
    "olive oil": {"quantity": 30, "unit": "ml", "estPriceEuro": 0.45}
    `;

    const priceSection = `
    2026 BELGIAN SUPERMARKET PRICES (Colruyt/Delhaize - use EXACTLY):
    PRODUCE: spinach €2.50/1000g (€0.25/100g), broccoli €2.80/1000g, carrots €1.80/1000g, cucumber €2.20/1000g, lemon €0.40/pc, tomatoes €3.20/1000g
    DAIRY: eggs €0.38/pc, milk €1.50/L (€0.23/150ml), cheese €14/1000g (€0.70/50g)
    MEAT: chicken breast €13/1000g (€1.95/150g), salmon €22/1000g (€3.30/150g)
    PANTRY: olive oil €12/L (€0.12/10ml, €0.36/30ml), pasta 500g €1.40, rice 1000g €2.20
    FROZEN: peas 400g €1.50
`;

    const varietyRule = `
    MEAL VARIETY GUIDELINES (preferred, not strict):
    
    RECIPES:
    - Prefer no identical recipe repeated within 3 days
    - Aim for different meal names across the plan
    
    PROTEINS (preferred rotation, not enforced):
    - Prefer max 2x chicken across the plan — ideally rotate to fish, beef, lamb, or legumes
    - Suggested rotation: chicken → beef/lamb → fish → legumes → repeat
    - Including at least 1x legume meal (lentils, chickpeas, beans) is encouraged
    
    VEGETABLES (preferred variety):
    - Prefer no single vegetable repeated more than 2x across the plan
    - Suggested rotation: spinach, broccoli, zucchini, bell peppers, carrots, sweet potato, cauliflower
    - Broccoli in dinners ideally max 2x, but not a hard limit
    
    COOKING METHODS (preferred variety):
    - Aim to rotate across: grilled, baked, stir-fried, steamed, raw/salad, soup/stew
    - Avoid same cooking method two meals in a row where possible
    
    BREAKFAST VARIETY (preferred, not required):
    - Ideally include across the week:
    - 1x grain-based (oats, granola, toast)
    - 1x dairy-based (yogurt parfait, smoothie)
    - 1x egg-based (not more than 2x total)
    - 1x fruit-forward (smoothie bowl, fruit salad, banana oats)
    - These are suggestions — prioritize feasibility over strict coverage
    `;



    return `You are a professional meal planner specialising in European (Belgian) cuisine.
Your task is to generate a personalised weekly meal plan in strict JSON format.

${dietSection}

${allergenSection}

${dislikeSection}

${dislikedRecipesSection}

${recentMealNamesSection}

${pricingSection}

${quantityRules}

${priceSection}

${varietyRule}


INGREDIENT FORMAT:
${ingredientExamples}

HOUSEHOLD: ${input.household.adults} adult(s), ${input.household.children} child(ren), ${input.household.toddlers} toddler(s).
Recipes should be practical for a Belgian household and use widely available supermarket ingredients.

OUTPUT FORMAT:
- Respond ONLY with a single valid JSON object that matches this schema exactly:

${JSON_SCHEMA_DESCRIPTION}
REQUIRED FIELDS (missing = failure):
• "estPriceEuro" on EVERY ingredient
• "totalEstimatedCostEuro" on EVERY day  
• "shortSummary" on EVERY meal (single sentence, 150 chars max)
• NO extra fields, NO text outside JSON



RULES:
1. Return exactly the days and meal slots specified in the user message — no more, no less.
2. dietTypes are HARD constraints: every single recipe must comply with ALL of them.
3. allergens are HARD constraints: zero tolerance — never include any ingredient that contains or is derived from any listed allergen, including hidden sources and derivatives.
4. Use plain, common ingredient names in English (e.g. "peanut butter" not "arachis paste").
5. Quantities are PER SERVING FOR ONE ADULT (not household total). The app scales them automatically based on household size. Example: "eggs: 2 pieces" = 2 eggs per adult.
6. Do not add any explanation, markdown, or text outside the JSON object.
7. Quantities MUST match rules above
8. NO decimals on eggs/pcs items
9. DIVERSITY: No recipe more than once every 3 days. Vary proteins/carbs.
10. Units MUST be exactly one of: g, kg, ml, L, tsp, tbsp, pcs, slice, cup — no other values accepted.
11. Pricing fields must be present and estimated realistically from the pricing section.
12. Do NOT include recipe instructions in the JSON output.
13. shortSummary must be exactly one sentence and no longer than 150 characters.
`;
}

/**
 * Build the user message describing exactly which days and meal slots to generate.
 */
function buildUserMessage(input: PromptInput): string {
    const dayLines: string[] = [];

    for (let day = 1; day <= input.planDays; day++) {
        const selection = input.mealSelection[String(day)] ?? {
            breakfast: true,
            lunch: true,
            dinner: true,
        };
        const slots = (["breakfast", "lunch", "dinner"] as const)
            .filter((slot) => selection[slot])
            .join(", ");

        if (slots) {
            let line = `  Day ${day}: ${slots}`;
            if (input.hints?.[String(day)]) {
                line += ` (HINT: ${input.hints[String(day)]})`;
            }
            dayLines.push(line);
        }
    }

    return `Please generate a ${input.planDays}-day meal plan with the following meal slots:
${dayLines.join("\n")}

Remember: all dietary requirements and allergen restrictions are hard constraints that cannot be waived.`;
}

/**
 * Build the complete prompt for the Groq chat API.
 *
 * @returns An object with `systemPrompt` and `userMessage` ready to pass to
 *          `groqClient.chat.completions.create()`.
 */
export function buildMealPlanPrompt(input: PromptInput): {
    systemPrompt: string;
    userMessage: string;
} {
    return {
        systemPrompt: buildSystemPrompt(input),
        userMessage: buildUserMessage(input),
    };
}
