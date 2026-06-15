import OpenAI from "openai";

export const chatModel = process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini";
export const embeddingModel =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

export function requireOpenAIKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
}

export function getOpenAI() {
  requireOpenAIKey();

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}
