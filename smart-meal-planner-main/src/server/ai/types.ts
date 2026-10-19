/**
 * Introduces GenerationContext so generation inputs can carry
 * pre-fetched exclusions and profile snapshot data across service boundaries.
 */
export const INSTRUCTIONS_PLACEHOLDER =
  "Open this recipe to view full cooking instructions.";

export interface GenerationContext {
  dislikedRecipes: string[];
  recentMealNames: string[];
  profileSnapshot: {
    adults: number;
    children: number;
    toddlers: number;
    dietTypes: string[];
    allergens: string[];
    dislikes: string[];
    weeklyBudgetEuro: number;
  };
}