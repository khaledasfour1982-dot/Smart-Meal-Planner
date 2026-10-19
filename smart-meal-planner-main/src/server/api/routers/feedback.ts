import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { mealFeedback } from "~/server/db/schema";

const RateFeedbackInputSchema = z.object({
  recipeName: z.string().min(1),
  rating: z.number().int().min(1).max(5),
});

const GetForPlanInputSchema = z.object({
  recipeNames: z.array(z.string()),
});

export const feedbackRouter = createTRPCRouter({
  getForPlan: protectedProcedure
    .input(GetForPlanInputSchema)
    .query(async ({ ctx, input }) => {
      const normalizedRecipeNames = Array.from(
        new Set(
          input.recipeNames
            .map((recipeName) => recipeName.toLowerCase().trim())
            .filter((recipeName) => recipeName.length > 0),
        ),
      );

      if (normalizedRecipeNames.length === 0) {
        return {} as Record<string, number>;
      }

      const rows = await ctx.db.query.mealFeedback.findMany({
        where: and(
          eq(mealFeedback.userId, ctx.session.user.id),
          inArray(mealFeedback.recipeName, normalizedRecipeNames),
        ),
        columns: {
          recipeName: true,
          rating: true,
        },
      });

      const ratingsByRecipe: Record<string, number> = {};
      for (const row of rows) {
        ratingsByRecipe[row.recipeName] = row.rating;
      }

      return ratingsByRecipe;
    }),

  rate: protectedProcedure
    .input(RateFeedbackInputSchema)
    .mutation(async ({ ctx, input }) => {
      const normalizedRecipeName = input.recipeName.toLowerCase().trim();

      if (normalizedRecipeName.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Recipe name must not be empty.",
        });
      }

      await ctx.db
        .insert(mealFeedback)
        .values({
          userId: ctx.session.user.id,
          recipeName: normalizedRecipeName,
          rating: input.rating,
        })
        .onConflictDoUpdate({
          target: [mealFeedback.userId, mealFeedback.recipeName],
          set: {
            rating: input.rating,
          },
        });

      return { success: true };
    }),
});
