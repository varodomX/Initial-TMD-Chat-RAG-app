import { Pool } from "pg";
import { embedText, vectorLiteral } from "./embeddings";
import type { RagDocumentInput, Retriever } from "./types";

let pool: Pool | undefined;

function shouldUseSsl(connectionString: string) {
  return (
    connectionString.includes("supabase.co") ||
    connectionString.includes("pooler.supabase.com") ||
    process.env.PGSSLMODE === "require"
  );
}

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

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
  return process.env.RAG_TABLE || "rag_documents";
}

export function createPgVectorRetriever(): Retriever {
  return {
    async search(query, limit) {
      const embedding = await embedText(query);
      const result = await getPool().query(
        `
          select
            id,
            content,
            metadata,
            1 - (embedding <=> $1::vector) as score
          from ${tableName()}
          order by embedding <=> $1::vector
          limit $2
        `,
        [vectorLiteral(embedding), limit],
      );

      return result.rows.map((row) => ({
        id: String(row.id),
        content: String(row.content),
        metadata: row.metadata ?? {},
        score: Number(row.score ?? 0),
      }));
    },

    async upsert(documents: RagDocumentInput[]) {
      let inserted = 0;

      for (const document of documents) {
        const embedding = await embedText(document.content);
        await getPool().query(
          `
            insert into ${tableName()} (id, content, metadata, embedding)
            values (coalesce($1, gen_random_uuid()::text), $2, $3::jsonb, $4::vector)
            on conflict (id)
            do update set
              content = excluded.content,
              metadata = excluded.metadata,
              embedding = excluded.embedding,
              updated_at = now()
          `,
          [
            document.id ?? null,
            document.content,
            JSON.stringify(document.metadata ?? {}),
            vectorLiteral(embedding),
          ],
        );
        inserted += 1;
      }

      return inserted;
    },
  };
}
