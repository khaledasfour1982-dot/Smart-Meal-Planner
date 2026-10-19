import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  generatePlanForCurrentUser,
  PlanGenerateInputSchema,
} from "~/server/services/plan-generation.service";

export const planRouter = createTRPCRouter({
  generate: protectedProcedure
    .input(PlanGenerateInputSchema)
    .mutation(async ({ ctx, input }) => {
      return generatePlanForCurrentUser({ ctx, input });
    }),
});
