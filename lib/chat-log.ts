import { appendFile, mkdir, readFile } from "fs/promises";
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

export type ChatLogHistoryEntry = ChatLogEntry & {
  sourceCount: number;
};

export type ChatQuestionHistoryEntry = {
  askedAt: string;
  askedAtBangkok: string;
  ip: string;
  conversationId: string;
  question: string;
  answer: string;
  error: string;
  mode: ChatLogEntry["mode"];
  hasImage: boolean;
  imageName: string;
};

function bangkokTime(isoDate: string) {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export async function readChatLogHistory(limit = 200) {
  try {
    const content = await readFile(logFile, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    const entries: ChatLogHistoryEntry[] = [];

    for (const line of lines.reverse()) {
      if (entries.length >= limit) break;

      try {
        const entry = JSON.parse(line) as ChatLogEntry;
        entries.push({
          ...entry,
          sourceCount: Array.isArray(entry.sources) ? entry.sources.length : 0,
        });
      } catch {
        // Skip malformed log rows so one bad append cannot break the history page.
      }
    }

    return entries;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }

    throw error;
  }
}

export async function readChatQuestionHistory(limit = 200) {
  const entries = await readChatLogHistory(limit);

  return entries.map(
    (entry): ChatQuestionHistoryEntry => ({
      askedAt: entry.createdAt,
      askedAtBangkok: bangkokTime(entry.createdAt),
      ip: entry.clientIp || entry.realIp || entry.forwardedFor || "",
      conversationId: entry.conversationId,
      question: entry.userMessage?.content || "",
      answer: entry.assistantMessage?.content || "",
      error: entry.error || "",
      mode: entry.mode,
      hasImage: Boolean(entry.userMessage?.imageUrl),
      imageName: entry.userMessage?.imageName || "",
    }),
  );
}
