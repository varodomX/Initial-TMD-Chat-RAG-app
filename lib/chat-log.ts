import { appendFile, mkdir, readFile } from "fs/promises";
import path from "path";
import { Pool } from "pg";
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
    | "quota-denied"
    | "question-received";
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
let pool: Pool | undefined;
let ensuredChatLogTable = false;

function shouldUseSsl(connectionString: string) {
  return (
    connectionString.includes("supabase.co") ||
    connectionString.includes("pooler.supabase.com") ||
    process.env.PGSSLMODE === "require"
  );
}

function getPool() {
  if (!process.env.DATABASE_URL) return undefined;

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: shouldUseSsl(process.env.DATABASE_URL)
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }

  return pool;
}

function tableName() {
  return process.env.CHAT_LOG_TABLE || "chat_logs";
}

function requireSafeTableName(name: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid CHAT_LOG_TABLE: ${name}`);
  }
}

async function ensureChatLogTable(db: Pool) {
  if (ensuredChatLogTable) return;

  const name = tableName();
  requireSafeTableName(name);

  await db.query("create extension if not exists pgcrypto");
  await db.query(`
    create table if not exists ${name} (
      id bigserial primary key,
      conversation_id text not null,
      created_at timestamptz not null,
      client_ip text,
      forwarded_for text,
      real_ip text,
      user_agent text,
      mode text not null,
      user_message jsonb not null,
      assistant_message jsonb,
      sources jsonb not null default '[]'::jsonb,
      source_count integer not null default 0,
      error text,
      inserted_at timestamptz not null default now()
    )
  `);
  await db.query(`
    create index if not exists ${name}_created_at_idx
    on ${name} (created_at desc, id desc)
  `);
  await db.query(`
    create index if not exists ${name}_conversation_id_idx
    on ${name} (conversation_id)
  `);

  ensuredChatLogTable = true;
}

async function appendChatLogToDatabase(entry: ChatLogEntry) {
  const db = getPool();
  if (!db) return;

  await ensureChatLogTable(db);

  await db.query(
    `
      insert into ${tableName()} (
        conversation_id,
        created_at,
        client_ip,
        forwarded_for,
        real_ip,
        user_agent,
        mode,
        user_message,
        assistant_message,
        sources,
        source_count,
        error
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12)
    `,
    [
      entry.conversationId,
      entry.createdAt,
      entry.clientIp ?? null,
      entry.forwardedFor ?? null,
      entry.realIp ?? null,
      entry.userAgent ?? null,
      entry.mode,
      JSON.stringify(entry.userMessage),
      entry.assistantMessage ? JSON.stringify(entry.assistantMessage) : null,
      JSON.stringify(entry.sources ?? []),
      entry.sources?.length ?? 0,
      entry.error ?? null,
    ],
  );
}

export async function appendChatLog(entry: ChatLogEntry) {
  try {
    await appendChatLogToDatabase(entry);
  } catch (error) {
    console.warn(
      "Database chat log was skipped:",
      error instanceof Error ? error.message : error,
    );
  }

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
  const entries: ChatLogHistoryEntry[] = [];
  const seen = new Set<string>();

  function pushEntry(entry: ChatLogHistoryEntry) {
    const key = [
      entry.conversationId,
      entry.createdAt,
      entry.mode,
      entry.userMessage?.content || "",
      entry.userMessage?.imageUrl || "",
    ].join("|");

    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  }

  const db = getPool();

  if (db) {
    try {
      await ensureChatLogTable(db);

      const result = await db.query(
        `
          select
            conversation_id,
            created_at,
            client_ip,
            forwarded_for,
            real_ip,
            user_agent,
            mode,
            user_message,
            assistant_message,
            sources,
            source_count,
            error
          from ${tableName()}
          order by created_at desc, id desc
          limit $1
        `,
        [limit],
      );

      for (const row of result.rows) {
        pushEntry({
          conversationId: String(row.conversation_id),
          createdAt: new Date(row.created_at).toISOString(),
          clientIp: row.client_ip ?? undefined,
          forwardedFor: row.forwarded_for ?? undefined,
          realIp: row.real_ip ?? undefined,
          userAgent: row.user_agent ?? undefined,
          mode: row.mode,
          userMessage: row.user_message,
          assistantMessage: row.assistant_message ?? undefined,
          sources: Array.isArray(row.sources) ? row.sources : [],
          sourceCount: Number(row.source_count ?? 0),
          error: row.error ?? undefined,
        });
      }
    } catch (error) {
      console.warn(
        "Database chat log read failed, falling back to file:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  try {
    const content = await readFile(logFile, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);

    for (const line of lines.reverse()) {
      if (entries.length >= limit) break;

      try {
        const entry = JSON.parse(line) as ChatLogEntry;
        pushEntry({
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
      return entries;
    }

    throw error;
  }

  return entries;
}

export async function readChatQuestionHistory(limit = 200) {
  const entries = await readChatLogHistory(limit * 2);
  const seen = new Set<string>();
  const questionEntries: ChatQuestionHistoryEntry[] = [];

  for (const entry of entries) {
    const key = [
      entry.conversationId,
      entry.createdAt,
      entry.userMessage?.content || "",
      entry.userMessage?.imageUrl || "",
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);

    questionEntries.push({
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
    });

    if (questionEntries.length >= limit) break;
  }

  return questionEntries;
}
