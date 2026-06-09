import { NextResponse } from "next/server";
import { appendChatLog } from "@/lib/chat-log";
import { chatModel, getOpenAI } from "@/lib/openai";
import { createRetriever, formatSourcesForPrompt } from "@/lib/rag/retriever";
import type { ChatMessage, RagSource } from "@/lib/rag/types";

export const runtime = "nodejs";

function latestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user");
}

function readOutputText(response: unknown) {
  const maybeResponse = response as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (maybeResponse.output_text) {
    return maybeResponse.output_text;
  }

  return (
    maybeResponse.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter(Boolean)
      .join("\n") || "I could not generate an answer."
  );
}

function isQuotaError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("429") || error.message.includes("quota");
}

function sourceLabel(source: RagSource, index: number) {
  const title =
    typeof source.metadata.title === "string" ? source.metadata.title : source.id;
  const page =
    typeof source.metadata.page === "number" ? ` หน้า ${source.metadata.page}` : "";

  return `[${index + 1}] ${title}${page}`;
}

function createExtractiveAnswer(sources: RagSource[], reason?: string) {
  if (!sources.length) {
    return [
      reason ? `${reason}\n` : "",
      "ยังไม่พบข้อความที่เกี่ยวข้องใน vector database สำหรับคำถามนี้ครับ",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const excerpts = sources.slice(0, 3).map((source, index) => {
    const compact = source.content.replace(/\s+/g, " ").trim();
    const excerpt = compact.length > 700 ? `${compact.slice(0, 700)}...` : compact;

    return `${sourceLabel(source, index)}\n${excerpt}`;
  });

  return [
    reason,
    "โหมดไม่ใช้ OpenAI API: ผมค้นจาก vector database แล้วดึงข้อความที่เกี่ยวข้องที่สุดมาให้ครับ ถ้าต้องการคำตอบแบบเรียบเรียงโดยโมเดล ต้องเปิดใช้ API หรือรัน local LLM เพิ่ม",
    ...excerpts,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(request: Request) {
  let conversationId = "unknown";
  let latest: ChatMessage | undefined;

  try {
    const body = (await request.json()) as {
      conversationId?: string;
      messages?: ChatMessage[];
    };
    conversationId = body.conversationId || crypto.randomUUID();
    const messages = body.messages ?? [];
    latest = latestUserMessage(messages);

    if (!latest?.content?.trim()) {
      return NextResponse.json(
        { error: "A user message is required." },
        { status: 400 },
      );
    }

    const retriever = createRetriever();
    const sources = await retriever.search(
      latest.content,
      Number(process.env.RAG_MATCH_COUNT || 6),
    );
    const context = formatSourcesForPrompt(sources);

    if (!process.env.OPENAI_API_KEY || process.env.AI_PROVIDER === "extractive") {
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: createExtractiveAnswer(
          sources,
          !process.env.OPENAI_API_KEY
            ? "ยังไม่ได้ตั้ง OPENAI_API_KEY จึงตอบจากข้อความที่ค้นเจอโดยตรง"
            : undefined,
        ),
      };

      await appendChatLog({
        conversationId,
        createdAt: new Date().toISOString(),
        userMessage: latest,
        assistantMessage,
        sources,
        mode: "extractive",
      });

      return NextResponse.json({
        message: assistantMessage,
        sources,
      });
    }

    try {
      const openai = getOpenAI();
      const response = await openai.responses.create({
        model: chatModel,
        input: [
          {
            role: "system",
            content:
              "You are TMD Chat, a concise Thai-first assistant. Answer from the provided RAG context when it is relevant. If the context is insufficient, say what is missing and avoid inventing facts. Cite sources inline as [1], [2] when using retrieved context.",
          },
          {
            role: "developer",
            content: `Retrieved context:\n\n${context}`,
          },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      });

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: readOutputText(response),
      };

      await appendChatLog({
        conversationId,
        createdAt: new Date().toISOString(),
        userMessage: latest,
        assistantMessage,
        sources,
        mode: "openai",
      });

      return NextResponse.json({
        message: assistantMessage,
        sources,
      });
    } catch (error) {
      if (!isQuotaError(error)) {
        throw error;
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: createExtractiveAnswer(
          sources,
          "OpenAI API แจ้งว่า quota ไม่พอ จึงสลับมาตอบจาก vector database โดยตรง",
        ),
      };

      await appendChatLog({
        conversationId,
        createdAt: new Date().toISOString(),
        userMessage: latest,
        assistantMessage,
        sources,
        mode: "quota-fallback",
      });

      return NextResponse.json({
        message: assistantMessage,
        sources,
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    if (latest) {
      await appendChatLog({
        conversationId,
        createdAt: new Date().toISOString(),
        userMessage: latest,
        error: message,
        mode: "openai",
      });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
