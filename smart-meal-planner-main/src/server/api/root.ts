import { postRouter } from "~/server/api/routers/post";
import { householdRouter } from "~/server/api/routers/household";
import { helpRouter } from "~/server/api/routers/help";
import { userRouter } from "~/server/api/routers/user";
import { plansRouter } from "~/server/api/routers/plans";
import { planRouter } from "~/server/api/routers/plan";
import { feedbackRouter } from "~/server/api/routers/feedback";
import { shoppingListRouter } from "~/server/api/routers/shopping-list";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import {mealsRouter} from "~/server/api/routers/meals";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  household: householdRouter,
  help: helpRouter,
  meals: mealsRouter,
  plan: planRouter,
  plans: plansRouter,
  user: userRouter,
  feedback: feedbackRouter,
  shoppingList: shoppingListRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
