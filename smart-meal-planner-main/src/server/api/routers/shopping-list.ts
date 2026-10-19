import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { categorizeIngredients } from "~/server/ai/aisle-categorizer";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { days, meals, plans, shoppingListItems, shoppingLists } from "~/server/db/schema";
import {
  aggregateIngredients,
  type ShoppingScope,
} from "~/server/services/shopping-list.service";
import {
  estimateListTotal,
  lookupPrice,
} from "~/server/services/ingredient-pricing.service";

const ShoppingScopeSchema = z.enum(["meal", "day", "plan"]);

const categorySchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .default("Other");

function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase();
}

function quantityToNumber(value: string | number): number {
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function defaultListName(scope: ShoppingScope): string {
  if (scope === "meal") {
    return "Meal Shopping List";
  }

  if (scope === "day") {
    return "Day Shopping List";
  }

  return "Plan Shopping List";
}

async function assertOwnedScope(params: {
  db: typeof import("~/server/db").db;
  userId: string;
  scope: ShoppingScope;
  scopeId: string;
}): Promise<void> {
  const { db, userId, scope, scopeId } = params;

  if (scope === "plan") {
    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, scopeId),
    });

    if (!plan) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
    }

    if (plan.userId !== userId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return;
  }

  if (scope === "day") {
    const day = await db.query.days.findFirst({
      where: eq(days.id, scopeId),
      with: {
        plan: true,
      },
    });

    if (!day) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Day not found" });
    }

    if (day.plan?.userId !== userId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return;
  }

  const meal = await db.query.meals.findFirst({
    where: eq(meals.id, scopeId),
    with: {
      day: {
        with: {
          plan: true,
        },
      },
    },
  });

  if (!meal) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Meal not found" });
  }

  if (meal.day?.plan?.userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

async function getOwnedListOrThrow(params: {
  db: typeof import("~/server/db").db;
  userId: string;
  listId: string;
}) {
  const list = await params.db.query.shoppingLists.findFirst({
    where: and(
      eq(shoppingLists.id, params.listId),
      eq(shoppingLists.userId, params.userId),
    ),
    with: {
      items: true,
    },
  });

  if (list) {
    return list;
  }

  const existingList = await params.db.query.shoppingLists.findFirst({
    where: eq(shoppingLists.id, params.listId),
    columns: { id: true },
  });

  if (existingList) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  throw new TRPCError({ code: "NOT_FOUND", message: "Shopping list not found" });
}

async function getOwnedItemOrThrow(params: {
  db: typeof import("~/server/db").db;
  userId: string;
  itemId: string;
}) {
  const item = await params.db.query.shoppingListItems.findFirst({
    where: eq(shoppingListItems.id, params.itemId),
    with: {
      shoppingList: true,
    },
  });

  if (!item) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Shopping item not found" });
  }

  if (item.shoppingList?.userId !== params.userId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return item;
}

export const shoppingListRouter = createTRPCRouter({
  generateList: protectedProcedure
    .input(
      z.object({
        scope: ShoppingScopeSchema,
        scopeId: z.string().min(1),
        dayIds: z.array(z.string().min(1)).optional(),
        name: z.string().trim().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await assertOwnedScope({
        db: ctx.db,
        userId,
        scope: input.scope,
        scopeId: input.scopeId,
      });

      const mergedIngredients = await aggregateIngredients(
        input.scope,
        input.scopeId,
        ctx.db,
        input.dayIds,
      );

      const categoryMap = await categorizeIngredients(
        mergedIngredients.map((ingredient) => ingredient.name),
      );

      const nextListName = input.name?.trim() || defaultListName(input.scope);

      const listId = await ctx.db.transaction(async (tx) => {
        const existingList = await tx.query.shoppingLists.findFirst({
          where: and(
            eq(shoppingLists.userId, userId),
            eq(shoppingLists.scope, input.scope),
            eq(shoppingLists.scopeId, input.scopeId),
          ),
          columns: { id: true },
        });

        if (!existingList) {
          const inserted = await tx
            .insert(shoppingLists)
            .values({
              userId,
              scope: input.scope,
              scopeId: input.scopeId,
              name: nextListName,
            })
            .returning({ id: shoppingLists.id });

          const insertedId = inserted[0]?.id;
          if (!insertedId) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to create shopping list",
            });
          }

          if (mergedIngredients.length > 0) {
            await tx.insert(shoppingListItems).values(
              mergedIngredients.map((ingredient) => ({
                shoppingListId: insertedId,
                ingredientName: ingredient.name,
                quantity: ingredient.quantity.toString(),
                unit: ingredient.unit,
                category:
                  categoryMap[normalizeIngredientName(ingredient.name)] ??
                  ingredient.category ??
                  "Other",
                isManual: false,
              })),
            );
          }

          return insertedId;
        }

        await tx
          .update(shoppingLists)
          .set({ name: nextListName })
          .where(eq(shoppingLists.id, existingList.id));

        await tx
          .delete(shoppingListItems)
          .where(eq(shoppingListItems.shoppingListId, existingList.id));

        if (mergedIngredients.length > 0) {
          await tx.insert(shoppingListItems).values(
            mergedIngredients.map((ingredient) => ({
              shoppingListId: existingList.id,
              ingredientName: ingredient.name,
              quantity: ingredient.quantity.toString(),
              unit: ingredient.unit,
              category:
                categoryMap[normalizeIngredientName(ingredient.name)] ??
                ingredient.category ??
                "Other",
              isManual: false,
            })),
          );
        }

        return existingList.id;
      });

      return getOwnedListOrThrow({ db: ctx.db, userId, listId });
    }),

  getList: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const list = await getOwnedListOrThrow({
        db: ctx.db,
        userId: ctx.session.user.id,
        listId: input.id,
      });

      const estimatedTotal = estimateListTotal(
        list.items.map((item) => ({
          name: item.ingredientName,
          quantity: quantityToNumber(item.quantity),
          unit: item.unit,
        })),
      );

      return {
        ...list,
        items: list.items.map((item) => {
          const priceMatch = lookupPrice(item.ingredientName);

          return {
            ...item,
            quantity: quantityToNumber(item.quantity),
            estimatedPriceEur: priceMatch?.estimatedPriceEur ?? null,
            priceUnit: priceMatch?.unit ?? null,
            typicalStore: priceMatch?.typicalStore ?? null,
          };
        }),
        estimatedTotal,
      };
    }),

  getLists: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const lists = await ctx.db.query.shoppingLists.findMany({
      where: eq(shoppingLists.userId, userId),
      orderBy: [desc(shoppingLists.createdAt)],
      with: {
        items: true,
      },
    });

    return lists.map((list) => ({
      ...list,
      items: list.items.map((item) => ({
        ...item,
        quantity: quantityToNumber(item.quantity),
      })),
    }));
  }),

  updateName: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const updated = await ctx.db
        .update(shoppingLists)
        .set({ name: input.name.trim() })
        .where(
          and(
            eq(shoppingLists.id, input.id),
            eq(shoppingLists.userId, userId),
          ),
        )
        .returning({ id: shoppingLists.id });

      const updatedId = updated[0]?.id;
      if (!updatedId) {
        const existingList = await ctx.db.query.shoppingLists.findFirst({
          where: eq(shoppingLists.id, input.id),
          columns: { id: true },
        });

        if (existingList) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        throw new TRPCError({ code: "NOT_FOUND", message: "Shopping list not found" });
      }

      const list = await getOwnedListOrThrow({
        db: ctx.db,
        userId,
        listId: updatedId,
      });

      return {
        ...list,
        items: list.items.map((item) => ({
          ...item,
          quantity: quantityToNumber(item.quantity),
        })),
      };
    }),

  addItem: protectedProcedure
    .input(
      z.object({
        listId: z.string().min(1),
        ingredientName: z.string().trim().min(1).max(120),
        quantity: z.number().positive(),
        unit: z.string().trim().min(1).max(20),
        category: categorySchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getOwnedListOrThrow({
        db: ctx.db,
        userId: ctx.session.user.id,
        listId: input.listId,
      });

      const generatedCategoryMap = await categorizeIngredients([input.ingredientName]);
      const category =
        input.category?.trim() ||
        generatedCategoryMap[normalizeIngredientName(input.ingredientName)] ||
        "Other";

      const inserted = await ctx.db
        .insert(shoppingListItems)
        .values({
          shoppingListId: input.listId,
          ingredientName: input.ingredientName.trim(),
          quantity: input.quantity.toString(),
          unit: input.unit.trim(),
          category,
          isManual: true,
        })
        .returning();

      return {
        ...inserted[0],
        quantity: quantityToNumber(inserted[0]?.quantity ?? input.quantity),
      };
    }),

  updateItem: protectedProcedure
    .input(
      z.object({
        itemId: z.string().min(1),
        ingredientName: z.string().trim().min(1).max(120).optional(),
        quantity: z.number().positive().optional(),
        unit: z.string().trim().min(1).max(20).optional(),
        category: categorySchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existingItem = await getOwnedItemOrThrow({
        db: ctx.db,
        userId: ctx.session.user.id,
        itemId: input.itemId,
      });

      const updateData: Partial<typeof shoppingListItems.$inferInsert> = {};

      if (input.ingredientName !== undefined) {
        updateData.ingredientName = input.ingredientName.trim();
      }

      if (input.quantity !== undefined) {
        updateData.quantity = input.quantity.toString();
      }

      if (input.unit !== undefined) {
        updateData.unit = input.unit.trim();
      }

      if (input.category !== undefined) {
        updateData.category = input.category.trim();
      }

      if (Object.keys(updateData).length === 0) {
        return {
          ...existingItem,
          quantity: quantityToNumber(existingItem.quantity),
        };
      }

      const updated = await ctx.db
        .update(shoppingListItems)
        .set(updateData)
        .where(eq(shoppingListItems.id, input.itemId))
        .returning();

      return {
        ...updated[0],
        quantity: quantityToNumber(updated[0]?.quantity ?? existingItem.quantity),
      };
    }),

  deleteItem: protectedProcedure
    .input(z.object({ itemId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await getOwnedItemOrThrow({
        db: ctx.db,
        userId: ctx.session.user.id,
        itemId: input.itemId,
      });

      await ctx.db
        .delete(shoppingListItems)
        .where(eq(shoppingListItems.id, input.itemId));

      return { success: true };
    }),

  toggleChecked: protectedProcedure
    .input(
      z.object({
        itemId: z.string().min(1),
        checked: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existingItem = await getOwnedItemOrThrow({
        db: ctx.db,
        userId: ctx.session.user.id,
        itemId: input.itemId,
      });

      const nextChecked = input.checked ?? !existingItem.isChecked;

      const updated = await ctx.db
        .update(shoppingListItems)
        .set({ isChecked: nextChecked })
        .where(eq(shoppingListItems.id, input.itemId))
        .returning({ id: shoppingListItems.id, isChecked: shoppingListItems.isChecked });

      return updated[0] ?? { id: input.itemId, isChecked: nextChecked };
    }),
});
