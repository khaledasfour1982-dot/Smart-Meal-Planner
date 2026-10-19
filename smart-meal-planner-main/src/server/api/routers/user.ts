import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { user } from "~/server/db/schema";
import bcrypt from "bcryptjs";
import {
  HouseholdProfileUpdateInputSchema,
  upsertHouseholdProfileForUser,
} from "~/server/services/household-profile.service";

const AccountProfileUpdateInputSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
  });

const UserUpdateProfileInputSchema = z.union([
  HouseholdProfileUpdateInputSchema,
  AccountProfileUpdateInputSchema,
]);

export const userRouter = createTRPCRouter({
  getConsentStatus: protectedProcedure.query(async ({ ctx }) => {
    const dbUser = await ctx.db.query.user.findFirst({
      where: eq(user.id, ctx.session.user.id),
      columns: {
        consentTimestamp: true,
      },
    });

    return {
      hasConsented: Boolean(dbUser?.consentTimestamp),
      consentTimestamp: dbUser?.consentTimestamp ?? null,
    };
  }),

  acceptConsent: protectedProcedure
    .input(
      z.object({
        accepted: z.literal(true),
      }),
    )
    .mutation(async ({ ctx }) => {
      const now = new Date();

      await ctx.db
        .update(user)
        .set({ consentTimestamp: now })
        .where(
          and(
            eq(user.id, ctx.session.user.id),
            isNull(user.consentTimestamp),
          ),
        );

      const dbUser = await ctx.db.query.user.findFirst({
        where: eq(user.id, ctx.session.user.id),
        columns: {
          consentTimestamp: true,
        },
      });

      return {
        hasConsented: Boolean(dbUser?.consentTimestamp),
        consentTimestamp: dbUser?.consentTimestamp ?? null,
      };
    }),

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const dbUser = await ctx.db.query.user.findFirst({
      where: eq(user.id, ctx.session.user.id),
      columns: {
        name: true,
        email: true,
      },
    });
    return dbUser;
  }),

  updateProfile: protectedProcedure
    .input(UserUpdateProfileInputSchema)
    .mutation(async ({ ctx, input }) => {
      const parsedHouseholdUpdate = HouseholdProfileUpdateInputSchema.safeParse(input);
      if (parsedHouseholdUpdate.success) {
        return upsertHouseholdProfileForUser({
          db: ctx.db,
          userId: ctx.session.user.id,
          input: parsedHouseholdUpdate.data,
        });
      }

      const parsedAccountUpdate = AccountProfileUpdateInputSchema.safeParse(input);
      if (!parsedAccountUpdate.success) {
        throw new Error("Invalid profile update payload");
      }

      await ctx.db
        .update(user)
        .set(parsedAccountUpdate.data)
        .where(eq(user.id, ctx.session.user.id));

      return { success: true };
    }),

  verifyCurrentPassword: protectedProcedure
    .input(z.object({ password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const dbUser = await ctx.db.query.user.findFirst({
        where: eq(user.id, ctx.session.user.id),
      });

      if (!dbUser) throw new Error("User not found");

      const isValid = await bcrypt.compare(input.password, dbUser.passwordHash);
      return { isValid };
    }),

  updatePassword: protectedProcedure
    .input(z.object({ newPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const hashedPassword = await bcrypt.hash(input.newPassword, 10);
      await ctx.db
        .update(user)
        .set({ passwordHash: hashedPassword })
        .where(eq(user.id, ctx.session.user.id));
      return { success: true };
    }),

  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.delete(user).where(eq(user.id, ctx.session.user.id));
    return { success: true };
  }),
});
