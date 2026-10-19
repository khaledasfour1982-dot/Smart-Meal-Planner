import OpenAI from "openai";
import { env } from "~/env.js";
import { getGroqClient, GROQ_MODEL } from "~/server/ai/groq-client";

export type AiProvider = "groq" | "openai";

export interface CompletionMetadata {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  finishReason?: string | null;
  isTruncated?: boolean;
}

export interface JsonCompletionResult {
  content: string;
  metadata?: CompletionMetadata;
}

const OPENAI_MODEL = env.OPENAI_MODEL;
const isDev = process.env.NODE_ENV !== "production";

let openaiClient: OpenAI | null = null;

const startupProvider = env.AI_PROVIDER;
const startupModel = startupProvider === "openai" ? OPENAI_MODEL : GROQ_MODEL;
const startupApiKeyPresent = startupProvider === "openai"
  ? Boolean(env.OPENAI_API_KEY?.trim())
  : Boolean(env.GROQ_API_KEY?.trim());

if (isDev) {
  console.log(
    `[ai-provider] active=${startupProvider} model=${startupModel} apiKeyPresent=${startupApiKeyPresent}`,
  );
}

function getOpenAiClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  return openaiClient;
}

export function getAiProvider(): AiProvider {
  if (env.AI_PROVIDER === "openai") return "openai";
  return "groq";
}

export async function createJsonCompletion(input: {
  systemPrompt: string;
  userMessage: string;
}): Promise<JsonCompletionResult> {
  const provider = getAiProvider();

  if (provider === "openai") {
    let completion;
    try {
      completion = await getOpenAiClient().chat.completions.create({
        model: OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userMessage },
        ],
      });
    } catch (error) {
      const errorType = error instanceof Error ? error.name : typeof error;
      const message = error instanceof Error ? error.message : String(error);
      console.error("[ai-provider] provider_request failed", { errorType, message });
      throw error;
    }

    const finishReason = completion.choices[0]?.finish_reason ?? null;
    const usage = completion.usage;

    return {
      content: completion.choices[0]?.message?.content ?? "",
      metadata: {
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
        finishReason,
        isTruncated: finishReason === "length",
      },
    };
  }

  const completion = await getGroqClient().chat.completions.create({
    model: GROQ_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userMessage },
    ],
  });

  const finishReason = completion.choices[0]?.finish_reason ?? null;
  const usage = completion.usage;

  return {
    content: completion.choices[0]?.message?.content ?? "",
    metadata: {
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      totalTokens: usage?.total_tokens,
      finishReason,
      isTruncated: finishReason === "length",
    },
  };
}

export async function createChatCompletion(input: {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const provider = getAiProvider();

  if (provider === "openai") {
    const completion = await getOpenAiClient().chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: input.systemPrompt },
        ...input.messages,
      ],
    });

    return completion.choices[0]?.message?.content ?? "";
  }

  const completion = await getGroqClient().chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: input.systemPrompt },
      ...input.messages,
    ],
  });

  return completion.choices[0]?.message?.content ?? "";
}

export async function* createStreamCompletion(input: {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const provider = getAiProvider();

  if (provider === "openai") {
    const stream = await getOpenAiClient().chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: input.systemPrompt },
        ...input.messages,
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  } else {
    const stream = await getGroqClient().chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: input.systemPrompt },
        ...input.messages,
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
