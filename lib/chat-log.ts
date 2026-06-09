import { appendFile, mkdir } from "fs/promises";
import path from "path";
import type { ChatMessage, RagSource } from "@/lib/rag/types";

export type ChatLogEntry = {
  conversationId: string;
  createdAt: string;
  userMessage: ChatMessage;
  assistantMessage?: ChatMessage;
  sources?: RagSource[];
  error?: string;
  mode: "openai" | "extractive" | "quota-fallback";
};

const logDir = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "data",
  "chat_logs",
);
const logFile = path.join(logDir, "chat_messages.jsonl");

export async function appendChatLog(entry: ChatLogEntry) {
  await mkdir(logDir, { recursive: true });
  await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
}
