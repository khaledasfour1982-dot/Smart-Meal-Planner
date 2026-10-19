import { beforeEach, describe, expect, it, vi } from "vitest";

describe("provider-specific AI env behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock("~/env");
    vi.unmock("~/env.js");
    vi.unmock("~/server/ai/groq-client");
    vi.unmock("~/server/services/ai-provider.service");
  });

  it("uses openai provider without requiring GROQ_API_KEY", async () => {
    vi.doMock("~/env.js", () => ({
      env: {
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "test-openai-key",
        OPENAI_MODEL: "gpt-4o-mini",
        GROQ_API_KEY: undefined,
        GROQ_MODEL: "llama-3.3-70b-versatile",
      },
    }));

    const { getAiProvider } = await import("~/server/services/ai-provider.service");
    expect(getAiProvider()).toBe("openai");
  });

  it("uses groq provider without requiring OPENAI_API_KEY", async () => {
    vi.doMock("~/env.js", () => ({
      env: {
        AI_PROVIDER: "groq",
        OPENAI_API_KEY: undefined,
        OPENAI_MODEL: "gpt-4o-mini",
        GROQ_API_KEY: "test-groq-key",
        GROQ_MODEL: "llama-3.3-70b-versatile",
      },
    }));

    const { getAiProvider } = await import("~/server/services/ai-provider.service");
    expect(getAiProvider()).toBe("groq");
  });

  it("throws clear error when groq is active and GROQ_API_KEY is missing", async () => {
    vi.doMock("~/env.js", () => ({
      env: {
        AI_PROVIDER: "groq",
        OPENAI_API_KEY: "test-openai-key",
        OPENAI_MODEL: "gpt-4o-mini",
        GROQ_API_KEY: "",
        GROQ_MODEL: "llama-3.3-70b-versatile",
      },
    }));

    const { getGroqClient } = await import("~/server/ai/groq-client");

    expect(() => getGroqClient()).toThrow("GROQ_API_KEY is required when AI_PROVIDER=groq.");
  });
});
