import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    DATABASE_URL_UNPOOLED: z.string().url(),
    NEXTAUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    NEXTAUTH_URL: z.preprocess(
      (str) =>
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : str,
      process.env.VERCEL ? z.string().optional() : z.string().url().optional(),
    ),
    AI_PROVIDER: z.enum(["groq", "openai"]).default("groq"),
    GROQ_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    PIXABAY_API_KEY: z.string().min(1),
    OPENAI_MODEL: z.string().default("gpt-4o-mini"),
    GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    AI_PROVIDER: process.env.AI_PROVIDER,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    PIXABAY_API_KEY: process.env.PIXABAY_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    GROQ_MODEL: process.env.GROQ_MODEL,
    NODE_ENV: process.env.NODE_ENV,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

if (env.AI_PROVIDER === "openai" && !env.OPENAI_API_KEY?.trim()) {
  throw new Error("AI_PROVIDER is set to openai but OPENAI_API_KEY is missing.");
}

if (env.AI_PROVIDER === "groq" && !env.GROQ_API_KEY?.trim()) {
  throw new Error("AI_PROVIDER is set to groq but GROQ_API_KEY is missing.");
}
