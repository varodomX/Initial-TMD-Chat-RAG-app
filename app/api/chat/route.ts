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
export const maxDuration = 60;

function latestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user");
}

async function toOpenAIInputMessage(
  message: ChatMessage,
  includeImage = true,
): Promise<ResponseInput[number]> {
  if (!message.imageUrl || !includeImage) {
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
        messages.map((message, index) =>
          toOpenAIInputMessage(message, index === messages.length - 1),
        ),
      );
      const input: ResponseInput = [
        {
          role: "system",
          content: [
            "You are TMD Chat, a concise Thai-first assistant. Answer from the provided RAG context when it is relevant.",
            "If the user sends an image, analyze the image carefully first, extract visible table values, weather-entry rows, the 'หมายเหตุลมฟ้าอากาศ' field, and rainfall timing tables such as 'ตารางเวลาฝนตกตั้งแต่เวลา 07:00-07:00', then connect them to the retrieved context when useful.",
            "If the user asks to check an observation table, prioritize ww/W1/W2 correctness over other columns.",
            "When checking ww/W1/W2, first identify whether the observation time is a main SYNOP time, secondary SYNOP time, or an every-2-hours observation.",
            "Respect the time unit used in the question: if the question says UTC, keep event times and observation times in UTC; if it says เวลาไทย/น.ไทย or uses Thai local observation times such as 07:00, 10:00, 13:00, 16:00, 19:00, 22:00, 01:00, 04:00 without UTC, treat them as Thai local time.",
            "Convert only when needed to identify the SYNOP round or explain the comparison, and label the converted time clearly. Convert UTC to Thai local time using UTC+7: 0000 UTC=07:00 Thai, 0300 UTC=10:00 Thai, 0600 UTC=13:00 Thai, 0900 UTC=16:00 Thai, 1200 UTC=19:00 Thai, 1500 UTC=22:00 Thai, 1800 UTC=01:00 Thai next day, 2100 UTC=04:00 Thai next day.",
            "Official W1/W2 reference period rule 12.2.6.6.1: main times 0000, 0600, 1200, 1800 UTC cover 6 hours; secondary times 0300, 0900, 1500, 2100 UTC cover 3 hours; if observations are made every 2 hours, W1/W2 cover 2 hours.",
            "Thai main times are 07:00, 13:00, 19:00, and 01:00 next day. Thai secondary times are 10:00, 16:00, 22:00, and 04:00 next day.",
            "Do not permanently shorten W1/W2 to only 5 hours for main times or only 2 hours for secondary times. The official W1/W2 reference period remains 6 or 3 hours, except the special every-2-hours case.",
            "Selection rule 12.2.6.6.2: choose W1 and W2 so that W1W2 together with ww gives the most complete possible description of weather during the referenced period. If weather changed completely during the period, W1/W2 should show the predominant past weather before the weather represented by ww began.",
            "The final 1 hour before observation is important for present weather ww and transition ww 20-29, but events in that final hour can still inform W1/W2 when needed to describe the referenced period completely. Do not drop rain or thunderstorm from W1/W2 solely because it is also reflected in ww.",
            "If ordinary rain codes 60-69 occur anywhere in the valid W1/W2 reference period, they contribute past weather group 6 and usually make W1=6 unless a higher group such as thunderstorm group 9 is also present.",
            "If thunderstorm or thundery precipitation codes 17, 29, or 91-99 occur anywhere in the valid W1/W2 reference period, they contribute past weather group 9 and usually make W1=9 because group 9 is higher than rain group 6 and cloud group 2.",
            "Separate plain thunderstorm from thundery precipitation. Use ww=17 only when thunder is heard or thunderstorm is observed but there is no precipitation at the station at observation time. Use ww=91-99 only when there is precipitation at the station with thunderstorm/thunder evidence: 91-92 ordinary rain at observation with thunderstorm in the preceding hour but none at observation, 93-94 snow/hail type at observation with thunderstorm in the preceding hour but none at observation, 95-99 thunderstorm at observation with rain/snow/hail. Do not use ww=79 for thunderstorm at observation time.",
            "For thunderstorm at observation time with precipitation at the station, use ww=95 for light or moderate thunderstorm rain/snow and no hail; ww=97 for heavy thunderstorm rain/snow without hail; ww=96 or ww=99 when hail is present according to intensity. If precipitation intensity or hail is not clearly stated in a thundery-precipitation question, assume light or moderate without hail and use ww=95. If the question says only thunder is heard or plain ฟ้าคะนอง and explicitly says no rain/precipitation at the station, use ww=17.",
            "W1/W2 code priorities: 0 cloud <= half all period; 1 cloud > half part-time and <= half part-time; 2 cloud > half all period; 3 dust/sand/blowing snow; 4 fog/ice fog/thick haze; 5 drizzle; 6 rain; 7 snow or mixed rain-snow; 8 showers; 9 thunderstorms with or without rain.",
            "If more than one past-weather code can be assigned, use the highest code for W1 and the next highest code for W2; W1 must be greater than or equal to W2.",
            "If the whole W1/W2 reference period is under only one weather type, use the same code for both W1 and W2, such as W1W2=66 for rain throughout or W1W2=99 for thunderstorm throughout.",
            "If several present weather codes occur within the final 1-hour ww period, report the highest numeric code as ww, except do not let codes 20-49 win by this highest-number rule; if code 17 is present together with other codes, report ww=17.",
            "For transition ww 20-29 such as ww=21, do not remove the underlying past phenomenon from W1/W2 if that phenomenon occurred in the valid W1/W2 reference period; ww=21 can coexist with W1=6 when rain also occurred in the referenced period.",
            "Example: at secondary time 03:00 UTC, the W1/W2 reference period is 00:00-03:00 UTC. Ordinary moderate continuous rain 00:00-02:45 UTC gives ww=21 if it stopped before observation; because rain occurred in the referenced period, W1=6. With cloud cover more than half throughout as remaining evidence, W1W2=62 and 7wwW1W2=72162, not 72122 or 2122.",
            "Example: at main time 06:00 UTC, thundery rain from 00:00-06:00 UTC with cloud cover more than half throughout gives ww=95 if intensity/hail is not specified, because thunderstorm with precipitation is present at observation time; W1W2=99 because thunderstorm covers the full 6-hour reference period. Therefore 7wwW1W2=79599, not 71799. If the same question says thunder was heard but there was no rain/precipitation at the station at observation time, use ww=17 instead.",
            "For ww 91/92, do not choose from thunderstorm evidence alone: both require thunderstorm in the preceding 1 hour but none at observation time, and the deciding difference is the present ordinary rain intensity at observation time; use ww=91 for light ordinary rain and ww=92 for moderate or heavy ordinary rain. If a 91/92-style question does not clearly state the rain/thunderstorm intensity, assume light by default and use ww=91. Then still choose W1/W2 from the valid past-weather evidence in the reference period: rain group 6 outranks cloud group 2, so rain plus cloud usually gives W1=6 and W2=2 unless a higher remaining group applies.",
            "For ww 01/02/03, compare total cloud amount at the current observation with the observation 3 hours earlier: decreased = 01, unchanged = 02, increased = 03.",
            "If the user asks what to enter in the source weather-entry system, recommend the event codes and time ranges to enter before explaining the final ww/W1/W2 result.",
            "Report by observation time with: recorded ww/W1/W2, status (correct / needs review / incorrect), reason, and suggested correction if any.",
            "If a ww/W1/W2 entry is wrong and the available data is sufficient, state clearly that it is wrong, where it is wrong, the observation time, why the recorded value is wrong, and what value it should be changed to.",
            "If a text-only question asks for a ww code but the rain details are ambiguous, ask for the rain type, rain amount or intensity, observation time, and whether the rain was still occurring at observation time before giving a code; if an image is attached, inspect the image for those missing details before asking.",
            "Use needs review only when the image/data is unclear or missing required evidence. Do not flag blank future observation slots as errors.",
            "If the context is insufficient, say what is missing and avoid inventing facts. Do not show source citations or bracketed reference numbers such as [1], [2], or [6] in the final answer.",
          ].join(" "),
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
