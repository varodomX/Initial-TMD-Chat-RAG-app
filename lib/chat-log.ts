import { appendFile, mkdir } from "fs/promises";
import path from "path";
import type { ChatMessage, RagSource } from "@/lib/rag/types";

export type ChatLogClientInfo = {
  clientIp?: string;
  forwardedFor?: string;
  realIp?: string;
  userAgent?: string;
};

export type ChatLogEntry = {
  conversationId: string;
  createdAt: string;
  userMessage: ChatMessage;
  assistantMessage?: ChatMessage;
  sources?: RagSource[];
  error?: string;
  mode:
    | "openai"
    | "extractive"
    | "quota-fallback"
    | "clarification"
    | "khonkaen-rain-csv"
    | "quota-denied";
} & ChatLogClientInfo;

export function getChatLogClientInfo(request: Request): ChatLogClientInfo {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const realIp = request.headers.get("x-real-ip") || "";
  const cfConnectingIp = request.headers.get("cf-connecting-ip") || "";
  const trueClientIp = request.headers.get("true-client-ip") || "";
  const userAgent = request.headers.get("user-agent") || "";
  const clientIp =
    forwardedFor.split(",")[0]?.trim() ||
    realIp ||
    cfConnectingIp ||
    trueClientIp ||
    undefined;

  return {
    clientIp,
    forwardedFor: forwardedFor || undefined,
    realIp: realIp || undefined,
    userAgent: userAgent || undefined,
  };
}

const logDir = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "data",
  "chat_logs",
);
const logFile = path.join(logDir, "chat_messages.jsonl");

export async function appendChatLog(entry: ChatLogEntry) {
  try {
    await mkdir(logDir, { recursive: true });
    await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.warn(
      "Chat log was skipped:",
      error instanceof Error ? error.message : error,
    );
  }
}
