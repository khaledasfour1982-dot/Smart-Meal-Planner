import Groq from "groq-sdk";
import { env } from "~/env.js";

/**
 * Singleton Groq SDK instance.
 *
 * - Uses GROQ_API_KEY from env (validated at startup by T3 env schema).
 * - Model defaults to "llama-3.3-70b-versatile"; override via GROQ_MODEL env var.
 * - Never logs the API key.
 */
let groqClientSingleton: Groq | null = null;

export function getGroqClient(): Groq {
  if (groqClientSingleton) {
    return groqClientSingleton;
  }

  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is required when AI_PROVIDER=groq.");
  }

  groqClientSingleton = new Groq({
    apiKey,
  });

  return groqClientSingleton;
}

/** The model to use for all meal-plan generation requests. */
export const GROQ_MODEL = env.GROQ_MODEL;
