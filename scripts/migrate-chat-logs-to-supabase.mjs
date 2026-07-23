import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

function loadEnvFile(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] && !override) continue;

    process.env[key] = rawValue
      .replace(/^"(.*)"$/, "$1")
      .replace(/^'(.*)'$/, "$1");
  }
}

function shouldUseSsl(connectionString) {
  return (
    connectionString.includes("supabase.co") ||
    connectionString.includes("pooler.supabase.com") ||
    process.env.PGSSLMODE === "require"
  );
}

function tableName() {
  return process.env.CHAT_LOG_TABLE || "chat_logs";
}

function requireSafeTableName(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid CHAT_LOG_TABLE: ${name}`);
  }
}

async function ensureChatLogTable(db) {
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
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        console.warn(`Skipped invalid JSONL line ${index + 1}`);
        return null;
      }
    })
    .filter(Boolean);
}

async function rowExists(db, entry) {
  const result = await db.query(
    `
      select 1
      from ${tableName()}
      where conversation_id = $1
        and created_at = $2
        and mode = $3
        and coalesce(user_message->>'content', '') = $4
        and coalesce(user_message->>'imageUrl', '') = $5
      limit 1
    `,
    [
      entry.conversationId,
      entry.createdAt,
      entry.mode,
      entry.userMessage?.content || "",
      entry.userMessage?.imageUrl || "",
    ],
  );

  return result.rowCount > 0;
}

async function insertEntry(db, entry) {
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

async function main() {
  loadEnvFile(path.resolve(".env.local"), { override: true });
  loadEnvFile(path.resolve(".env"));

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const inputPath = path.resolve(
    process.argv[2] || "data/chat_logs/chat_messages.jsonl",
  );
  const entries = readJsonl(inputPath);
  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseSsl(process.env.DATABASE_URL)
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    await ensureChatLogTable(db);

    let inserted = 0;
    let skipped = 0;

    for (const entry of entries) {
      if (await rowExists(db, entry)) {
        skipped += 1;
        continue;
      }

      await insertEntry(db, entry);
      inserted += 1;
    }

    console.log(`Migrated ${inserted} chat log rows to ${tableName()}`);
    if (skipped) console.log(`Skipped ${skipped} existing rows`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
