import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";
import pg from "pg";

const { Pool } = pg;

const DEFAULT_PATHS = [
  "data/custom_knowledge_vector_db/chunks.jsonl",
  "data/khonkaen_station_vector_db/chunks.jsonl",
  "data/synop_vector_db/chunks.jsonl",
  "data/meteo_knowledge_vector_db/data/chunks.jsonl",
  "data/khonkaen_rain_vector_db/data/chunks.jsonl",
  "data/cloud_atlas_th_vector_db/cloud_chunks_th.jsonl",
  "data/cloud_multimodal_db/data/cloud_image_chunks.jsonl",
];

const NAMESPACED_ID_SOURCES = new Set([
  "meteo_knowledge_vector_db",
  "khonkaen_rain_vector_db",
]);

function sourceNamespace(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  const match = normalized.match(/data\/([^/]+)\//);
  return match?.[1] ?? path.basename(path.dirname(filePath));
}

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

function vectorLiteral(values) {
  return `[${values.join(",")}]`;
}

function readJsonl(filePath) {
  const absolutePath = path.resolve(filePath);
  const rows = fs
    .readFileSync(absolutePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`${filePath}:${index + 1} is not valid JSONL`);
      }
    });

  return rows
    .map((row, index) => {
      const content = row.content ?? row.text;
      if (!content || typeof content !== "string") return null;

      const rawId =
        typeof row.id === "string"
          ? row.id
          : `${path.basename(path.dirname(filePath))}-${index + 1}`;
      const namespace = sourceNamespace(filePath);
      const id = NAMESPACED_ID_SOURCES.has(namespace)
        ? `${namespace}:${rawId}`
        : rawId;
      const metadata = {
        ...row,
        raw_id: row.id,
        content: undefined,
        text: undefined,
        vector_source_file: filePath,
        vector_source_namespace: namespace,
      };

      return { id, content, metadata };
    })
    .filter(Boolean);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const paths = args.filter((arg) => !arg.startsWith("--"));

  return {
    dryRun,
    paths: paths.length ? paths : DEFAULT_PATHS,
  };
}

async function ensureSchema(pool, tableName) {
  await pool.query("create extension if not exists vector");
  await pool.query("create extension if not exists pgcrypto");
  await pool.query(`
    create table if not exists ${tableName} (
      id text primary key default gen_random_uuid()::text,
      content text not null,
      metadata jsonb not null default '{}'::jsonb,
      embedding vector(1536) not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create index if not exists ${tableName}_embedding_idx
    on ${tableName}
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100)
  `);
}

function requireSafeTableName(tableName) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
    throw new Error(`Invalid RAG_TABLE: ${tableName}`);
  }
}

function shouldUseSsl(connectionString) {
  return (
    connectionString.includes("supabase.co") ||
    connectionString.includes("pooler.supabase.com") ||
    process.env.PGSSLMODE === "require"
  );
}

async function main() {
  loadEnvFile(path.resolve(".env.local"), { override: true });
  loadEnvFile(path.resolve(".env"));

  const { dryRun, paths } = parseArgs();
  const tableName = process.env.RAG_TABLE || "rag_documents";
  requireSafeTableName(tableName);
  const embeddingModel =
    process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const documents = paths.flatMap((filePath) => readJsonl(filePath));

  console.log(`files: ${paths.join(", ")}`);
  console.log(`documents: ${documents.length}`);
  console.log(`table: ${tableName}`);
  console.log(`embedding model: ${embeddingModel}`);

  if (dryRun) return;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseSsl(process.env.DATABASE_URL)
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    await ensureSchema(pool, tableName);

    const batchSize = 64;
    let upserted = 0;

    for (let start = 0; start < documents.length; start += batchSize) {
      const batch = documents.slice(start, start + batchSize);
      const response = await openai.embeddings.create({
        model: embeddingModel,
        input: batch.map((document) => document.content),
      });

      for (let index = 0; index < batch.length; index += 1) {
        const document = batch[index];
        const embedding = response.data[index].embedding;

        await pool.query(
          `
            insert into ${tableName} (id, content, metadata, embedding)
            values ($1, $2, $3::jsonb, $4::vector)
            on conflict (id)
            do update set
              content = excluded.content,
              metadata = excluded.metadata,
              embedding = excluded.embedding,
              updated_at = now()
          `,
          [
            document.id,
            document.content,
            JSON.stringify(document.metadata),
            vectorLiteral(embedding),
          ],
        );
      }

      upserted += batch.length;
      console.log(`upserted ${upserted}/${documents.length}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
