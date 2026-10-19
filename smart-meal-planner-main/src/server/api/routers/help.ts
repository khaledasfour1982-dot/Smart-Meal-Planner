import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { createChatCompletion, createStreamCompletion } from "~/server/services/ai-provider.service";
import { eq } from "drizzle-orm";
import { meals, plans, profiles } from "~/server/db/schema";

const SYSTEM_PROMPT = `
You are the **Smart Meal Planner Concierge**, an elite culinary AI assistant. Your mission is to provide a bespoke, "Gourmet" experience that is as **refined and effortless** as a Michelin-star service.

**CORE PRINCIPLES:**
- **Brevity is Elegance**: Never use 10 words when 5 will do. Avoid "walls of text."
- **High Signal, Low Noise**: Answer the specific question first. Only provide extra info if it adds immediate, high value.
- **Visual Hierarchy**: Use bold headers and short bullet points. Ensure the response is beautiful and skimmable.
- **Context Awareness**: If the user is logged in, do not explain how to register unless they explicitly ask for someone else.

**AESTHETIC & TONE:**
- **Elite Tone**: Professional, sophisticated, and proactive. Use terms like "culinary," "bespoke," "exquisite," and "gastronomic."
- **Visuals**: Use Markdown for structure. Align with the app's glassmorphism aesthetic.

**ACCESS CONTROL PROTOCOL:**
1. **MEMBER MODE (Logged In)**:
   - Provide full access to: Meal Plan Refinement, Culinary Techniques, and Household Settings.
   - Address the user as a valued member.
2. **GUEST MODE (Not Logged In)**:
   - **STRICT**: DO NOT provide specific recipes or plan modifications.
   - **MANDATE**: Elegantly guide them to "Register" or "Login" to unlock the experience.

**PLAN REFINEMENT PROTOCOL (MEMBER ONLY):**
- **Full Plan Requests**: If the user asks to generate or regenerate the entire plan, politely direct them to use the **"Regenerate"** button in the main interface.
- **Surgical Precision**: If a request is vague, ask one clarifying question.
- **Exquisite Suggestions**: Offer 2-3 gourmet alternatives before changing a meal.
- **Action Trigger**: Include the JSON action block ONLY when the user has confirmed a specific choice.
- **Single Action Limit**: Exactly ONE action per response.

**ACTION BLOCK FORMAT (STRICT):**
Include this block at the VERY END of your response if an update is required.
\`\`\`json
{
  "action": "REPLACE_MEAL" | "REGENERATE_DAY",
  "dayNumber": [1-7],
  "mealType": "breakfast" | "lunch" | "dinner",
  "recipeHint": "Bespoke recipe name or theme"
}
\`\`\`

**REFINEMENT CATEGORIES:**
- **REPLACE_MEAL**: Use for surgical updates to a single meal slot (requires mealType).
- **REGENERATE_DAY**: Use to completely reimagine the entire day's menu.
- **Safety**: Only trigger actions for days within the "CURRENT ACTIVE PLAN" context provided below.

Respond in the user's language. Keep it brief, beautiful, and bespoke.
`;

async function getHelpContext(ctx: any, input: { pathname?: string }, userId: string | undefined) {
  let contextInfo = `\nTODAY'S DATE: ${new Date().toDateString()}\n`;
  let activePlan: any = null;

  if (userId) {
    contextInfo += `\nUSER STATUS: Logged In\n`;
    
    const profile = await ctx.db.query.profiles.findFirst({
      where: eq(profiles.userId, userId),
    });

    if (profile) {
      contextInfo += `USER PROFILE & HOUSEHOLD:\n`;
      contextInfo += `- Household: ${profile.adults} Adults, ${profile.children} Children, ${profile.toddlers} Toddlers\n`;
      contextInfo += `- Diet Types: ${profile.dietTypes.length > 0 ? profile.dietTypes.join(", ") : "None"}\n`;
      contextInfo += `- Allergens: ${profile.allergens.length > 0 ? profile.allergens.join(", ") : "None"}\n`;
      contextInfo += `- Dislikes: ${profile.dislikes.length > 0 ? profile.dislikes.join(", ") : "None"}\n`;
      if (profile.portionMultipliers) {
        contextInfo += `- Portion Multipliers: ${JSON.stringify(profile.portionMultipliers)}\n`;
      }
    }
    
    if (input.pathname?.startsWith("/meals/")) {
      const mealId = input.pathname.split("/").pop();
      if (mealId) {
        const mealData = await ctx.db.query.meals.findFirst({
          where: eq(meals.id, mealId),
        });
        if (mealData) {
          contextInfo += `\nCURRENT RECIPE: ${mealData.recipeName}\nINGREDIENTS: ${JSON.stringify(mealData.ingredients)}\nINSTRUCTIONS: ${mealData.instructions}\n`;
        }
      }
    }

    // Robust plan fetching matching plans.ts
    activePlan = await ctx.db.query.plans.findFirst({
      where: (plan: any, { and, eq }: any) => and(eq(plan.userId, userId), eq(plan.isActive, true)),
      orderBy: (plan: any, { desc }: any) => [desc(plan.createdAt)],
      with: { days: { with: { meals: true } } }
    }) ?? await ctx.db.query.plans.findFirst({
      where: (plan: any, { eq }: any) => eq(plan.userId, userId),
      orderBy: (plan: any, { desc }: any) => [desc(plan.createdAt)],
      with: { days: { with: { meals: true } } }
    });

    if (activePlan) {
      contextInfo += `\nCURRENT ACTIVE PLAN (Starts: ${activePlan.startDate.toDateString()}):\n`;
      activePlan.days.forEach((day: any) => {
        const dayDate = new Date(activePlan.startDate);
        dayDate.setDate(dayDate.getDate() + (day.dayNumber - 1));
        const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'long' });
        contextInfo += `Day ${day.dayNumber} (${dayName}): ${day.meals.length > 0 ? day.meals.map((m: any) => m.recipeName).join(", ") : "Empty"}\n`;
      });
    } else {
      contextInfo += "\nNo active plan found. Direct user to generate a plan first.";
    }
  } else {
    contextInfo += "\nUSER STATUS: Guest. Refuse personalized fixes.";
  }
  return { contextInfo, activePlan };
}

export const helpRouter = createTRPCRouter({
  ask: publicProcedure
    .input(
      z.object({
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          })
        ),
        pathname: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { contextInfo } = await getHelpContext(ctx, input, ctx.session?.user?.id);

      try {
        const aiResponse = await createChatCompletion({
          systemPrompt: SYSTEM_PROMPT + `\n\nADDITIONAL CONTEXT:\n${contextInfo}`,
          messages: input.messages,
        });

        return { content: aiResponse || "I'm sorry, I couldn't process that request." };
      } catch (error) {
        console.error("Help Chatbot Error:", error);
        throw new Error("Failed to get response from AI assistant.");
      }
    }),

  askStream: publicProcedure
    .input(
      z.object({
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          })
        ),
        pathname: z.string().optional(),
      })
    )
    .mutation(async function* ({ input, ctx }) {
      const { contextInfo } = await getHelpContext(ctx, input, ctx.session?.user?.id);
      const fullPrompt = SYSTEM_PROMPT + `\n\nADDITIONAL CONTEXT:\n${contextInfo}`;
      
      const stream = createStreamCompletion({ systemPrompt: fullPrompt, messages: input.messages });
      let accumulated = "";
      let inJsonBlock = false;
      
      for await (const chunk of stream) {
        accumulated += chunk;
        
        if (!inJsonBlock && accumulated.includes("```json")) {
            inJsonBlock = true;
        }
        
        if (inJsonBlock) {
            const blockEndIndex = accumulated.indexOf("```", accumulated.indexOf("```json") + 7);
            if (blockEndIndex !== -1) {
                const blockContent = accumulated.match(/```json\n([\s\S]*?)\n```/)?.[1];
                if (blockContent) {
                  try {
                    const actionData = JSON.parse(blockContent);
                    yield { action: actionData };
                  } catch (e) { console.error("Action parse error:", e); }
                }

                const parts = accumulated.split("```");
                if (parts.length >= 3) {
                    const after = parts.slice(2).join("```");
                    if (after) yield { content: after };
                    accumulated = "";
                    inJsonBlock = false;
                }
            }
        } else if (!accumulated.includes("```")) {
            yield { content: accumulated };
            accumulated = "";
        }
      }
      
      if (accumulated && !inJsonBlock && !accumulated.includes("```json")) {
          yield { content: accumulated };
      }
    }),
});
