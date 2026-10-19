/**
 * Placeholder router — will be replaced by user.ts, plan.ts, shopping.ts routers
 */
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const postRouter = createTRPCRouter({
  healthCheck: publicProcedure.query(() => ({
    status: "ok",
  })),
});

