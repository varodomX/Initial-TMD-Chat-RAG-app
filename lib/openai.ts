import OpenAI from "openai";

function resolveChatModel() {
  const configuredModel = process.env.OPENAI_CHAT_MODEL?.trim();

  if (!configuredModel) {
    return "gpt-5.5";
  }

  return configuredModel;
}

export const chatModel = resolveChatModel();
export const fallbackChatModel = "gpt-5.5";
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
