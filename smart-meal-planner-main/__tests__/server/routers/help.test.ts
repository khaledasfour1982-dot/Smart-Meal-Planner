import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";
import { createCallerFactory } from "~/server/api/trpc";
import { helpRouter } from "~/server/api/routers/help";
import { mockSession } from "../../helpers/mock-session";
import { meals, plans, profiles } from "~/server/db/schema";
import { eq } from "drizzle-orm";

// --- Mocks ---

const dbMocks = vi.hoisted(() => ({
  findFirstMeal: vi.fn(),
  findFirstPlan: vi.fn(),
  findFirstProfile: vi.fn(),
  update: vi.fn(),
}));

const aiMocks = vi.hoisted(() => ({
  createChatCompletion: vi.fn(),
  createStreamCompletion: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    query: {
      meals: { findFirst: dbMocks.findFirstMeal },
      plans: { findFirst: dbMocks.findFirstPlan },
      profiles: { findFirst: dbMocks.findFirstProfile },
    },
    update: dbMocks.update,
  },
}));

vi.mock("~/server/services/ai-provider.service", () => ({
  createChatCompletion: aiMocks.createChatCompletion,
  createStreamCompletion: aiMocks.createStreamCompletion,
  getAiProvider: vi.fn().mockReturnValue("openai"),
}));

// --- Test Setup ---

const makeCallerFactory = createCallerFactory(helpRouter);

function authedCaller(userId = "user-1") {
  return makeCallerFactory({
    db: db as any,
    session: mockSession(userId),
    headers: new Headers(),
  } as any);
}

function unauthedCaller() {
  return makeCallerFactory({
    db: db as any,
    session: null,
    headers: new Headers(),
  } as any);
}

const mockRecipe = {
  id: "meal-1",
  recipeName: "Grilled Salmon",
  ingredients: [{ name: "Salmon", quantity: 1, unit: "piece" }],
  instructions: "Grill the salmon.",
};

const mockPlan = {
  id: "plan-1",
  userId: "user-1",
  isActive: true,
  startDate: new Date("2026-03-18"),
  days: [
    {
      dayNumber: 1,
      meals: [{ mealType: "dinner", recipeName: "Grilled Salmon" }],
    },
    {
      dayNumber: 2,
      meals: [{ mealType: "dinner", recipeName: "Pasta" }],
    }
  ],
};

describe("helpRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Guest Access Test
  it("strictly refuses to provide personalized help to guests and directs to login", async () => {
    aiMocks.createChatCompletion.mockResolvedValue("I'm sorry, I cannot provide recipe suggestions or plan changes as a guest. Please **Sign In** to access these features.");
    
    const result = await unauthedCaller().ask({ 
      messages: [{ role: "user", content: "Suggest me a chicken recipe" }] 
    });

    expect(result.content).toContain("Sign In");
    expect(dbMocks.findFirstMeal).not.toHaveBeenCalled();
    expect(aiMocks.createChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: expect.stringContaining("GUEST MODE")
    }));
  });

  // 2. Authenticated General Context Test
  it("includes plan context when a logged-in user is on the /plan page", async () => {
    dbMocks.findFirstPlan.mockResolvedValue(mockPlan);
    aiMocks.createChatCompletion.mockResolvedValue("Plan help.");

    await authedCaller().ask({ 
      messages: [{ role: "user", content: "What is for dinner?" }],
      pathname: "/plan"
    });

    expect(dbMocks.findFirstPlan).toHaveBeenCalled();
    expect(aiMocks.createChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: expect.stringContaining("Day 1 (Wednesday): Grilled Salmon")
    }));
  });

  // 3. Active Recipe Context Test
  it("includes recipe details when a user is on a /meals/[id] page", async () => {
    dbMocks.findFirstMeal.mockResolvedValue(mockRecipe);
    dbMocks.findFirstPlan.mockResolvedValue(mockPlan);
    aiMocks.createChatCompletion.mockResolvedValue("Recipe help.");

    await authedCaller().ask({ 
      messages: [{ role: "user", content: "How do I grill this?" }],
      pathname: "/meals/meal-1"
    });

    expect(dbMocks.findFirstMeal).toHaveBeenCalled();
    expect(aiMocks.createChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: expect.stringContaining("Grilled Salmon")
    }));
  });

  // 4. askStream basic streaming test
  it("askStream yields chunks correctly", async () => {
    async function* mockStream() {
        yield "Hello ";
        yield "world";
    }
    aiMocks.createStreamCompletion.mockReturnValue(mockStream());

    const caller = authedCaller();
    const stream = await caller.askStream({ messages: [] });

    const chunks = [];
    for await (const chunk of stream) {
        if (chunk.content) chunks.push(chunk.content);
    }

    expect(chunks).toEqual(["Hello ", "world"]);
  });

  // 5. askStream yields action chunk
  it("askStream yields action chunk when detected", async () => {
    async function* mockStream() { 
      yield "Intro ";
      yield "```json\n{\"action\": \"REPLACE_MEAL\", \"dayNumber\": 1, \"mealType\": \"dinner\"}\n```";
      yield "Outro";
    }
    aiMocks.createStreamCompletion.mockReturnValue(mockStream());

    const stream = await authedCaller().askStream({ messages: [] });
    const chunks = [];
    const actions = [];
    for await (const chunk of stream) { 
      if (chunk.content) chunks.push(chunk.content);
      if (chunk.action) actions.push(chunk.action);
    }

    expect(actions[0]).toEqual(expect.objectContaining({ action: "REPLACE_MEAL", dayNumber: 1 }));
    expect(chunks.join("")).toBe("Intro Outro");
  });

  // 6. Date context
  it("includes today's date in context", async () => {
    dbMocks.findFirstPlan.mockResolvedValue(mockPlan);
    aiMocks.createChatCompletion.mockResolvedValue("OK");

    await authedCaller().ask({ messages: [] });

    expect(aiMocks.createChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: expect.stringMatching(/TODAY'S DATE:.*2026/)
    }));
  });
});
