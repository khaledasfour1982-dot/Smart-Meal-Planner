import { eq } from "drizzle-orm";
import { z } from "zod";
import { profiles } from "~/server/db/schema";

export const HouseholdProfileUpdateInputSchema = z.object({
  adults: z.number().int().min(1).max(10),
  children: z.number().int().min(0).max(10),
  toddlers: z.number().int().min(0).max(10),
  dietTypes: z.array(z.string()),
  allergens: z.array(z.string()),
  dislikes: z.array(z.string()),
  weeklyBudgetEuro: z.number().int().min(0).max(1000).default(0),
  portionMultipliers: z
    .object({
      adult: z.number().min(0.1).max(5),
      child: z.number().min(0.1).max(5),
      toddler: z.number().min(0.1).max(5),
    })
    .nullable(),
});

export type HouseholdProfileUpdateInput = z.infer<
  typeof HouseholdProfileUpdateInputSchema
>;

export async function upsertHouseholdProfileForUser(params: {
  db: any;
  userId: string;
  input: HouseholdProfileUpdateInput;
}) {
  const { db, userId, input } = params;

  const existing = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });

  const data = {
    adults: input.adults,
    children: input.children,
    toddlers: input.toddlers,
    dietTypes: input.dietTypes,
    allergens: input.allergens,
    dislikes: input.dislikes,
    portionMultipliers: input.portionMultipliers,
    weeklyBudgetEuro: input.weeklyBudgetEuro,
    updatedAt: new Date(),
  };

  if (existing) {
    return db.update(profiles).set(data).where(eq(profiles.userId, userId));
  }

  return db.insert(profiles).values({
    ...data,
    userId,
  });
}
