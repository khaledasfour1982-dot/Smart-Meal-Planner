/**
 * Invalidates user-scoped plan cache whenever household profile
 * preferences are updated.
 */
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { planCache, profiles } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import {
  HouseholdProfileUpdateInputSchema,
  upsertHouseholdProfileForUser,
} from "~/server/services/household-profile.service";

export const householdRouter = createTRPCRouter({
  // Get current user's profile
  get: protectedProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db.query.profiles.findFirst({
      where: eq(profiles.userId, ctx.session.user.id),
    });
    return profile ?? null;
  }),

  // Update or create complete profile data
  updateProfile: protectedProcedure
    .input(HouseholdProfileUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(planCache)
        .where(eq(planCache.userId, ctx.session.user.id));

      return upsertHouseholdProfileForUser({
        db: ctx.db,
        userId: ctx.session.user.id,
        input,
      });
    }),
});