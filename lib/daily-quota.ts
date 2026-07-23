import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Pool } from "pg";

export const DAILY_QUESTION_LIMIT = 20;
export const DAILY_IMAGE_LIMIT = 10;

type QuotaKind = "question" | "image";

type QuotaStatus = {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
};

type LocalUsage = Record<
  string,
  {
    question: number;
    image: number;
  }
>;

let pool: Pool | undefined;
let tableReady = false;

const localUsagePath = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "data",
  "daily_usage.json",
);

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

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function clientHash(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const realIp = request.headers.get("x-real-ip") || "";
  const userAgent = request.headers.get("user-agent") || "";
  const rawClient = `${forwardedFor.split(",")[0].trim() || realIp || "local"}:${userAgent}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawClient),
  );

  return Buffer.from(digest).toString("hex").slice(0, 48);
}

async function ensureQuotaTable(db: Pool) {
  if (tableReady) return;

  await db.query(`
    create table if not exists daily_usage_quotas (
      client_hash text not null,
      usage_date date not null,
      question_count integer not null default 0,
      image_count integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (client_hash, usage_date)
    )
  `);
  tableReady = true;
}

async function incrementPostgresQuota(
  db: Pool,
  request: Request,
  kind: QuotaKind,
  limit: number,
): Promise<QuotaStatus> {
  await ensureQuotaTable(db);

  const hash = await clientHash(request);
  const date = todayKey();
  const column = kind === "question" ? "question_count" : "image_count";
  const result = await db.query(
    `
      insert into daily_usage_quotas (client_hash, usage_date, ${column})
      values ($1, $2::date, 1)
      on conflict (client_hash, usage_date)
      do update set
        ${column} = daily_usage_quotas.${column} + 1,
        updated_at = now()
      where daily_usage_quotas.${column} < $3
      returning question_count, image_count
    `,
    [hash, date, limit],
  );

  if (result.rows[0]) {
    const count = Number(result.rows[0][column]);
    return {
      allowed: true,
      count,
      limit,
      remaining: Math.max(limit - count, 0),
    };
  }

  const current = await db.query(
    `
      select ${column}
      from daily_usage_quotas
      where client_hash = $1 and usage_date = $2::date
    `,
    [hash, date],
  );
  const count = Number(current.rows[0]?.[column] ?? limit);

  return {
    allowed: false,
    count,
    limit,
    remaining: 0,
  };
}

async function incrementLocalQuota(
  request: Request,
  kind: QuotaKind,
  limit: number,
): Promise<QuotaStatus> {
  const hash = await clientHash(request);
  const date = todayKey();
  const key = `${date}:${hash}`;
  let usage: LocalUsage = {};

  try {
    usage = JSON.parse(await readFile(localUsagePath, "utf8")) as LocalUsage;
  } catch {
    usage = {};
  }

  const current = usage[key] ?? { question: 0, image: 0 };

  if (current[kind] >= limit) {
    return {
      allowed: false,
      count: current[kind],
      limit,
      remaining: 0,
    };
  }

  current[kind] += 1;
  usage[key] = current;
  await mkdir(path.dirname(localUsagePath), { recursive: true });
  await writeFile(localUsagePath, JSON.stringify(usage, null, 2), "utf8");

  return {
    allowed: true,
    count: current[kind],
    limit,
    remaining: Math.max(limit - current[kind], 0),
  };
}

export async function incrementDailyQuota(
  request: Request,
  kind: QuotaKind,
) {
  const limit =
    kind === "question" ? DAILY_QUESTION_LIMIT : DAILY_IMAGE_LIMIT;
  const db = getPool();

  if (db) {
    try {
      return await incrementPostgresQuota(db, request, kind, limit);
    } catch (error) {
      console.warn(
        "Postgres quota failed; falling back to local quota:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return incrementLocalQuota(request, kind, limit);
}

export function quotaErrorMessage(kind: QuotaKind, limit: number) {
  const label = kind === "question" ? "คำถาม" : "รูป";
  return `วันนี้ใช้ครบ ${limit} ${label}แล้วครับ ลองใหม่พรุ่งนี้นะครับ`;
}
