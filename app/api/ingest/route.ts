import { NextResponse } from "next/server";
import { chunkText } from "@/lib/chunk";
import { createRetriever } from "@/lib/rag/retriever";
import type { RagDocumentInput } from "@/lib/rag/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      documents?: RagDocumentInput[];
      text?: string;
      metadata?: Record<string, unknown>;
    };
    const retriever = createRetriever();

    if (!retriever.upsert) {
      return NextResponse.json(
        {
          error:
            "Ingestion requires a writable vector database. Configure DATABASE_URL first.",
        },
        { status: 400 },
      );
    }

    const documents =
      body.documents ??
      chunkText(body.text ?? "").map((content, index) => ({
        id:
          typeof body.metadata?.source === "string"
            ? `${body.metadata.source}-${index}`
            : undefined,
        content,
        metadata: { ...body.metadata, chunk: index },
      }));

    if (!documents.length) {
      return NextResponse.json(
        { error: "Provide documents or text to ingest." },
        { status: 400 },
      );
    }

    const count = await retriever.upsert(documents);

    return NextResponse.json({ count });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
