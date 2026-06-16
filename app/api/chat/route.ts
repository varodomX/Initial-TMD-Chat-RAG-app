import { NextResponse } from "next/server";
import type {
  ResponseInput,
  ResponseInputMessageContentList,
} from "openai/resources/responses/responses";
import { appendChatLog } from "@/lib/chat-log";
import { chatModel, fallbackChatModel, getOpenAI } from "@/lib/openai";
import { createRetriever, formatSourcesForPrompt } from "@/lib/rag/retriever";
import type { ChatMessage, RagSource } from "@/lib/rag/types";
import { readUploadAsDataUrl } from "@/lib/uploads";

export const runtime = "nodejs";

function latestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user");
}

async function toOpenAIInputMessage(
  message: ChatMessage,
): Promise<ResponseInput[number]> {
  if (!message.imageUrl) {
    return {
      role: message.role,
      content: message.content,
    };
  }

  const content: ResponseInputMessageContentList = [
    {
      type: "input_text",
      text:
        message.content ||
        "วิเคราะห์รูปนี้ และตอบเป็นภาษาไทยโดยอิงบริบทเอกสารที่เกี่ยวข้องถ้ามี",
    },
    {
      type: "input_image",
      detail: "auto",
      image_url: await readUploadAsDataUrl(message.imageUrl),
    },
  ];

  return {
    role: message.role,
    content,
  };
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

function isInvalidModelError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("invalid model") || error.message.includes("model ID");
}

function isAmbiguousWwRainQuestion(message: string) {
  const normalized = message.toLowerCase();
  const asksForWw =
    normalized.includes("ww") ||
    normalized.includes("รหัส") ||
    normalized.includes("ให้รหัส");
  const mentionsRain =
    normalized.includes("ฝน") || normalized.includes("rain");
  const hasSpecificRainType =
    normalized.includes("ฝนธรรมดา") ||
    normalized.includes("ฝนฟ้าคะนอง") ||
    normalized.includes("พายุฟ้าคะนอง") ||
    normalized.includes("ฟ้าคะนอง") ||
    normalized.includes("ฝนซู่") ||
    normalized.includes("ฝนละออง") ||
    normalized.includes("ฝนโปรย") ||
    normalized.includes("ลูกเห็บ") ||
    normalized.includes("thunder") ||
    normalized.includes("shower");
  const hasRainAmount =
    normalized.includes("ปริมาณ") ||
    normalized.includes("มม") ||
    normalized.includes("mm") ||
    normalized.includes("เบา") ||
    normalized.includes("ปานกลาง") ||
    normalized.includes("หนัก");

  return asksForWw && mentionsRain && !hasSpecificRainType && !hasRainAmount;
}

function createWwClarificationMessage(): ChatMessage {
  return {
    role: "assistant",
    content:
      "ข้อมูลยังไม่พอให้ตัดสินรหัส ww ครับ ขอรายละเอียดเพิ่มหน่อย:\n\n- เป็นฝนประเภทไหน: ฝนธรรมดา, ฝนซู่, ฝนละออง, ฝนโปรย หรือฝนฟ้าคะนอง\n- ปริมาณฝนเท่าไหร่ หรืออย่างน้อยความแรง: เบา, ปานกลาง, หนัก\n- รอบเวลาตรวจคือกี่โมง เช่น 16:00\n- ตอนตรวจยังตกอยู่ไหม หรือหยุดก่อนตรวจแล้ว",
  };
}

function sourceLabel(source: RagSource) {
  const title =
    typeof source.metadata.title === "string" ? source.metadata.title : source.id;
  const page =
    typeof source.metadata.page === "number" ? ` หน้า ${source.metadata.page}` : "";

  return `${title}${page}`;
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

  const excerpts = sources.slice(0, 3).map((source) => {
    const compact = source.content.replace(/\s+/g, " ").trim();
    const excerpt = compact.length > 700 ? `${compact.slice(0, 700)}...` : compact;

    return `${sourceLabel(source)}\n${excerpt}`;
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

    if (!latest?.content?.trim() && !latest?.imageUrl) {
      return NextResponse.json(
        { error: "A user message or image is required." },
        { status: 400 },
      );
    }

    if (
      latest.content &&
      !latest.imageUrl &&
      isAmbiguousWwRainQuestion(latest.content)
    ) {
      const assistantMessage = createWwClarificationMessage();

      await appendChatLog({
        conversationId,
        createdAt: new Date().toISOString(),
        userMessage: latest,
        assistantMessage,
        sources: [],
        mode: "clarification",
      });

      return NextResponse.json({
        message: assistantMessage,
        sources: [],
      });
    }

    const retriever = createRetriever();
    const retrievalQuery = latest.content.trim() || latest.imageName || "รูปภาพ";
    const sources = await retriever.search(
      retrievalQuery,
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
      const inputMessages = await Promise.all(
        messages.map((message) => toOpenAIInputMessage(message)),
      );
      const input: ResponseInput = [
        {
          role: "system",
          content:
            "You are TMD Chat, a concise Thai-first assistant. Answer from the provided RAG context when it is relevant. If the user sends an image, analyze the image carefully first, extract visible table values, weather-entry rows, the 'หมายเหตุลมฟ้าอากาศ' field, and the rainfall timing table such as 'ตารางเวลาฝนตกตั้งแต่เวลา 07:00-07:00', then connect them to the retrieved context when useful. If the user asks to check an observation table, prioritize ww/W1/W2 correctness over other columns. When checking ww/W1/W2, first identify whether the observation time is a main or secondary SYNOP time. Respect the time unit used in the question: if the question says UTC, keep event times and observation times in UTC; if it says เวลาไทย/น.ไทย or uses Thai local observation times such as 07:00, 10:00, 13:00, 16:00, 19:00, 22:00, 01:00, 04:00 without UTC, treat them as Thai local time. Convert only when needed to identify the SYNOP round or explain the comparison, and label the converted time clearly. Convert UTC to Thai local time using UTC+7: 0000 UTC=07:00 Thai, 0300 UTC=10:00 Thai, 0600 UTC=13:00 Thai, 0900 UTC=16:00 Thai, 1200 UTC=19:00 Thai, 1500 UTC=22:00 Thai, 1800 UTC=01:00 Thai next day, 2100 UTC=04:00 Thai next day. Thai main times are 07:00, 13:00, 19:00, and 01:00, and W1/W2 cover the previous 6 hours. Thai secondary times are 10:00, 16:00, 22:00, and 04:00, and W1/W2 cover the previous 3 hours. Do not assume W1/W2 always cover only 3 hours. Consider all weather events in that W1/W2 coverage window: there may be multiple candidate codes, one selected as present/past-transition ww and the remaining events used for W1/W2. After choosing ww, do not duplicate the same phenomenon already encoded by ww into W1/W2; especially ww 91-94 already includes thunderstorm in the preceding hour together with present rain/showers, so W1/W2 should describe the remaining past-weather or sky-state evidence. When multiple remaining past-weather codes apply, use the highest remaining code as W1 and the next highest as W2, but cloud codes 0-2 may be correct W1/W2 when ww already accounts for the thunderstorm/rain. For ww 01/02/03, compare total cloud amount at the current observation with the observation 3 hours earlier: decreased = 01, unchanged = 02, increased = 03. If the user asks what to enter in the source weather-entry system, recommend the event codes and time ranges to enter before explaining the final ww/W1/W2 result. Report by observation time with: recorded ww/W1/W2, status (correct / needs review / incorrect), reason, and suggested correction if any. If a ww/W1/W2 entry is wrong and the available data is sufficient, state clearly that it is wrong, where it is wrong, the observation time, why the recorded value is wrong, and what value it should be changed to. If a text-only question asks for a ww code but the rain details are ambiguous, ask for the rain type, rain amount or intensity, observation time, and whether the rain was still occurring at observation time before giving a code; if an image is attached, inspect the image for those missing details before asking. Use needs review only when the image/data is unclear or missing required evidence. Do not flag blank future observation slots as errors. If the context is insufficient, say what is missing and avoid inventing facts. Do not show source citations or bracketed reference numbers such as [1], [2], or [6] in the final answer.",
        },
        {
          role: "developer",
          content: `Retrieved context:\n\n${context}`,
        },
        ...inputMessages,
      ];
      let requestedModel = chatModel;
      let response;

      try {
        response = await openai.responses.create({
          model: requestedModel,
          input,
        });
      } catch (error) {
        if (!isInvalidModelError(error) || requestedModel === fallbackChatModel) {
          throw error;
        }

        requestedModel = fallbackChatModel;
        response = await openai.responses.create({
          model: requestedModel,
          input,
        });
      }

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
    const rawMessage =
      error instanceof Error ? error.message : "Unexpected server error.";
    const message =
      rawMessage.includes("invalid model") || rawMessage.includes("model ID")
        ? `${rawMessage} (requested model: ${chatModel}, fallback: ${fallbackChatModel}). Check that this OpenAI project/API key has access to the configured model in the OpenAI Models page.`
        : rawMessage;

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
