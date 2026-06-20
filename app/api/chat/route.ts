import fs from "node:fs";
import path from "node:path";
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

type RainDailyRecord = {
  year: number;
  month: number;
  day: number;
  district: string;
  stationCode: string;
  rainMm: number;
};

let rainRecordsCache: RainDailyRecord[] | undefined;

const THAI_MONTHS = [
  "",
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

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

function sourceImage(source: RagSource) {
  const imageUrl =
    typeof source.metadata.imageUrl === "string"
      ? source.metadata.imageUrl
      : undefined;

  if (!imageUrl) return undefined;

  return {
    imageUrl,
    imageName:
      typeof source.metadata.title === "string"
        ? source.metadata.title
        : source.id,
  };
}

function attachBestSourceImage(
  message: ChatMessage,
  sources: RagSource[],
): ChatMessage {
  const image = sources.map(sourceImage).find(Boolean);

  if (!image) return message;

  return {
    ...message,
    imageName: image.imageName,
    imageUrl: image.imageUrl,
  };
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

function readKhonKaenRainRecords() {
  if (rainRecordsCache) return rainRecordsCache;

  const csvPath = path.join(
    process.cwd(),
    "data",
    "khonkaen_rain_vector_db",
    "data",
    "cleaned_daily_rain_records.csv",
  );

  if (!fs.existsSync(csvPath)) {
    rainRecordsCache = [];
    return rainRecordsCache;
  }

  const [headerLine = "", ...lines] = fs
    .readFileSync(csvPath, "utf8")
    .trim()
    .split(/\r?\n/);
  const headers = headerLine.replace(/^\uFEFF/, "").split(",");
  const indexByHeader = new Map(headers.map((header, index) => [header, index]));

  function value(columns: string[], header: string) {
    const index = indexByHeader.get(header);
    return typeof index === "number" ? columns[index] ?? "" : "";
  }

  rainRecordsCache = lines
    .map((line) => {
      const columns = line.split(",");
      return {
        year: Number(value(columns, "year")),
        month: Number(value(columns, "month")),
        day: Number(value(columns, "day")),
        district: value(columns, "district"),
        stationCode: value(columns, "station_code"),
        rainMm: Number(value(columns, "rain_mm")),
      };
    })
    .filter(
      (record) =>
        Number.isFinite(record.year) &&
        Number.isFinite(record.month) &&
        Number.isFinite(record.day) &&
        Number.isFinite(record.rainMm) &&
        record.district,
    );

  return rainRecordsCache;
}

function normalizeThaiText(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

function extractRainDistrict(message: string, records: RainDailyRecord[]) {
  const normalized = normalizeThaiText(message);
  const districts = Array.from(new Set(records.map((record) => record.district)));

  return districts.find((district) => {
    const full = normalizeThaiText(district);
    const short = full.replace(/^อำเภอ/, "");
    return normalized.includes(full) || normalized.includes(short);
  });
}

function extractRainYear(message: string) {
  const normalized = normalizeThaiText(message);

  if (normalized.includes("ปีที่แล้ว")) {
    return new Date().getFullYear() - 1;
  }

  const christianYear = message.match(/(?:ค\.ศ\.|ปี)?\s*(20\d{2})/);
  if (christianYear) return Number(christianYear[1]);

  const buddhistYear = message.match(/(?:พ\.ศ\.|ปี)?\s*(25\d{2})/);
  if (buddhistYear) return Number(buddhistYear[1]) - 543;

  return undefined;
}

function createKhonKaenRainAnswer(message: string): ChatMessage | undefined {
  const normalized = normalizeThaiText(message);
  const asksRain = normalized.includes("ฝน") || normalized.includes("rain");
  const asksMaximum =
    normalized.includes("ตกหนักที่สุด") ||
    normalized.includes("หนักที่สุด") ||
    normalized.includes("มากที่สุด") ||
    normalized.includes("สูงสุด");
  const asksDate =
    normalized.includes("วันที่") ||
    normalized.includes("วันไหน") ||
    normalized.includes("เมื่อไหร่") ||
    normalized.includes("เมื่อไร");

  if (!asksRain || !asksMaximum || !asksDate) {
    return undefined;
  }

  const records = readKhonKaenRainRecords();
  const district = extractRainDistrict(message, records);
  const year = extractRainYear(message);

  if (!district || !year) {
    return undefined;
  }

  const candidates = records.filter(
    (record) => record.district === district && record.year === year,
  );

  if (!candidates.length) {
    return {
      role: "assistant",
      content: `ยังไม่พบข้อมูลฝนรายวันของ ${district} ปี ${year} ในฐานข้อมูลครับ`,
    };
  }

  const maxRain = Math.max(...candidates.map((record) => record.rainMm));
  const maxRecords = candidates.filter((record) => record.rainMm === maxRain);

  if (maxRain <= 0) {
    return {
      role: "assistant",
      content: `${district} ปี ${year} ไม่มีวันที่มีฝนมากกว่า 0.0 มม. ในฐานข้อมูลครับ`,
    };
  }

  const dates = maxRecords
    .map(
      (record) =>
        `${record.day} ${THAI_MONTHS[record.month]} ${record.year} ` +
        `(สถานี ${record.stationCode})`,
    )
    .join(", ");

  return {
    role: "assistant",
    content:
      `ฝนของ${district}ที่ตกหนักที่สุดในปี ${year} คือวันที่ ${dates}\n` +
      `ปริมาณฝนสูงสุดรายวัน ${maxRain.toFixed(1)} มม.`,
  };
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

    if (latest.content && !latest.imageUrl) {
      const rainAnswer = createKhonKaenRainAnswer(latest.content);

      if (rainAnswer) {
        await appendChatLog({
          conversationId,
          createdAt: new Date().toISOString(),
          userMessage: latest,
          assistantMessage: rainAnswer,
          sources: [],
          mode: "khonkaen-rain-csv",
        });

        return NextResponse.json({
          message: rainAnswer,
          sources: [],
        });
      }
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
      const assistantMessageWithImage = attachBestSourceImage(
        assistantMessage,
        sources,
      );

      await appendChatLog({
        conversationId,
        createdAt: new Date().toISOString(),
        userMessage: latest,
        assistantMessage: assistantMessageWithImage,
        sources,
        mode: "extractive",
      });

      return NextResponse.json({
        message: assistantMessageWithImage,
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
            "If thunderstorm or thundery precipitation codes 17, 29, or 91-99 occur anywhere in the valid W1/W2 reference period, they can contribute past weather group 9 and usually make W1=9 because group 9 is higher than rain group 6 and cloud group 2. Exception: when transition ww=29 already represents the thunderstorm that stopped within the minute-35 cutoff, choose W1/W2 to describe the remaining significant past weather needed for completeness, such as rain group 6 and cloud group 2.",
            "Separate plain thunderstorm from thundery precipitation. Use ww=17 only when thunder is heard or thunderstorm is observed but there is no precipitation at the station at observation time. Use ww=91-99 only when there is precipitation at the station with thunderstorm/thunder evidence: 91-92 ordinary rain at observation with thunderstorm in the preceding hour but none at observation, 93-94 snow/hail type at observation with thunderstorm in the preceding hour but none at observation, 95-99 thunderstorm at observation with rain/snow/hail. Do not use ww=79 for thunderstorm at observation time.",
            "For thunderstorm at observation time with precipitation at the station, use ww=95 for light or moderate thunderstorm rain/snow and no hail; ww=97 for heavy thunderstorm rain/snow without hail; ww=96 or ww=99 when hail is present according to intensity. If a question asks for ฝนฟ้าคะนอง but does not state light, moderate, heavy, or hail, assume light without hail by default and use ww=95. If the question says only thunder is heard or plain ฟ้าคะนอง and explicitly says no rain/precipitation at the station, use ww=17.",
            "W1/W2 code priorities: 0 cloud <= half all period; 1 cloud > half part-time and <= half part-time; 2 cloud > half all period; 3 dust/sand/blowing snow; 4 fog/ice fog/thick haze; 5 drizzle; 6 rain; 7 snow or mixed rain-snow; 8 showers; 9 thunderstorms with or without rain.",
            "For haze/mist present weather, distinguish dry and humid ฟ้าหลัว: ww=05 is dry haze (ฟ้าหลัวแห้ง / haze, visibility 1 to <10 km, relative humidity <65%); ww=10 is humid haze/mist (ฟ้าหลัวชื้น / mist, visibility 1 to <10 km, relative humidity >=65%).",
            "For W1/W2, low-significance weather such as ww 01/02/03 cloud-change codes, ww=10 humid mist, ww=05 dry haze, or ฟ้าหลัว can describe the whole 3-hour secondary period or 6-hour main period only when no more significant past weather occurred. If significant weather occurs in the reference period, it outranks these fallback conditions: rain/drizzle/showers/thunderstorm/thundery rain must be selected before cloud-change or haze-like fallback codes.",
            "If more than one past-weather code can be assigned, use the highest code for W1 and the next highest code for W2; W1 must be greater than or equal to W2.",
            "If the whole W1/W2 reference period is under only one weather type, use the same code for both W1 and W2, such as W1W2=66 for rain throughout or W1W2=99 for thunderstorm throughout.",
            "Use W1W2=99 only when thunderstorm/thundery precipitation group 9 continuously covers the entire official W1/W2 reference period with no gaps: 6 hours for main times, 3 hours for secondary times, or 2 hours for every-2-hours observations. Plain thunderstorm (ฟ้าคะนอง/ww17) and thundery precipitation (ฝนฟ้าคะนอง/ww95-99) are the same past-weather group 9; they do not count as two separate W1/W2 phenomena. If group 9 occurs but has a gap in the reference period, use W1=9 and choose W2 from the next valid evidence such as cloud group 2 or rain group 6. Example: at main time 12:00 UTC, heavy thundery rain 06:00-11:10 and plain thunderstorm 11:45-12:00 leaves a 11:10-11:45 gap, so with cloud > half throughout use W1W2=92 and 7wwW1W2=71792, not 71799.",
            "If several present weather codes occur within the final 1-hour ww period at the same time, report the highest numeric code as ww, except do not let codes 20-49 win by this highest-number rule. If the phenomena occur as a time sequence in the final hour, identify the latest phenomenon after the relevant cutoff and use that as ww. If the latest phenomenon is plain thunderstorm/thunder heard with no precipitation at the station, use ww=17 even if earlier thundery rain would have converted to ww=29.",
            "This latest-phenomenon rule for ww also applies when earlier rain is followed by haze/mist. If ordinary rain or heavy rain stops before the final part of the observation hour and the latest phenomenon at observation time is humid ฟ้าหลัวชื้น, use ww=10 as the present weather; if it is dry ฟ้าหลัวแห้ง, use ww=05. Still keep the earlier rain in W1/W2 if it occurred in the reference period. Example: at 06:00 UTC, heavy continuous ordinary rain 00:00-05:00, then humid haze 05:00-06:00 and cloud > half throughout gives 7wwW1W2=71062.",
            "For ordinary continuous rain in the final hour before observation, apply the minute-50 cutoff carefully: if rain stopped at or before minute 50 of the observation hour, use transition ww=21; if rain stopped from minute 51 through the observation time, treat it as present rain and use ww=61 for light continuous rain, ww=63 for moderate continuous rain, or ww=65 for heavy continuous rain. Example: at 06:00 UTC, light continuous ordinary rain from 00:00-05:55 gives ww=61, not ww=21.",
            "For thunderstorm or thundery precipitation in the final hour before observation, apply the minute-35 cutoff carefully: if it stopped at or before minute 35 of the observation hour, use transition ww=29; if it continued beyond minute 35 (minute 36 through the observation time), treat it as present thunderstorm/thundery precipitation and use ww=95-99 according to precipitation intensity and hail. Example: at 09:00 UTC, moderate thundery rain from 08:10-08:35 gives ww=29; if it continues to 08:36 or later, use the appropriate 95-99 code instead.",
            "For sequential thunderstorm cases, ww=29 applies only if the thundery precipitation/thunderstorm that stopped within the minute-35 cutoff is the last relevant phenomenon in the final hour. If a later plain thunderstorm/thunder heard event occurs after minute 35 without precipitation at the station, use ww=17. Example: at 12:00 UTC, thundery rain 09:45-11:10 would be ww=29 by itself, but a later plain thunderstorm 11:35-11:50 makes ww=17, so 7wwW1W2 can be 71796.",
            "When ww=29 already represents the thunderstorm/thundery precipitation transition, W1/W2 should describe the remaining important past weather needed for completeness; do not automatically duplicate thunderstorm as W1=9 if that would hide ordinary rain group 6 and cloud group 2. Example: 09:00 UTC with ordinary light continuous rain 06:30-08:10, moderate thundery rain 08:10-08:35, and cloud > half throughout gives 7wwW1W2=72962.",
            "For transition ww 20-29 such as ww=21, do not remove the underlying past phenomenon from W1/W2 if that phenomenon occurred in the valid W1/W2 reference period; ww=21 can coexist with W1=6 when rain also occurred in the referenced period.",
            "Example: at secondary time 03:00 UTC, the W1/W2 reference period is 00:00-03:00 UTC. Ordinary moderate continuous rain 00:00-02:45 UTC gives ww=21 if it stopped before observation; because rain occurred in the referenced period, W1=6. With cloud cover more than half throughout as remaining evidence, W1W2=62 and 7wwW1W2=72162, not 72122 or 2122.",
            "Example: at main time 06:00 UTC, thundery rain from 00:00-06:00 UTC with cloud cover more than half throughout gives ww=95 if intensity/hail is not specified, because default thundery rain intensity is light and thunderstorm with precipitation is present at observation time; W1W2=99 because thunderstorm covers the full 6-hour reference period. Therefore 7wwW1W2=79599, not 71799. If the same question says thunder was heard but there was no rain/precipitation at the station at observation time, use ww=17 instead.",
            "For ww 91/92, do not choose from thunderstorm evidence alone: both require thunderstorm in the preceding 1 hour but none at observation time, and the deciding difference is the present ordinary rain intensity at observation time; use ww=91 for light ordinary rain and ww=92 for moderate or heavy ordinary rain. If a 91/92-style question does not clearly state the rain/thunderstorm intensity, assume light by default and use ww=91. Then still choose W1/W2 from the valid past-weather evidence in the reference period: rain group 6 outranks cloud group 2, so rain plus cloud usually gives W1=6 and W2=2 unless a higher remaining group applies.",
            "For ww 01/02/03, compare total cloud amount at the current observation with the observation 3 hours earlier: decreased = 01, unchanged = 02, increased = 03. These codes can be used as present weather when no more significant present weather applies, but for W1/W2 they are fallback evidence and must not override rain group 6 or thunderstorm group 9 in the same reference period.",
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
      const assistantMessageWithImage = attachBestSourceImage(
        assistantMessage,
        sources,
      );

      await appendChatLog({
        conversationId,
        createdAt: new Date().toISOString(),
        userMessage: latest,
        assistantMessage: assistantMessageWithImage,
        sources,
        mode: "openai",
      });

      return NextResponse.json({
        message: assistantMessageWithImage,
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
      const assistantMessageWithImage = attachBestSourceImage(
        assistantMessage,
        sources,
      );

      await appendChatLog({
        conversationId,
        createdAt: new Date().toISOString(),
        userMessage: latest,
        assistantMessage: assistantMessageWithImage,
        sources,
        mode: "quota-fallback",
      });

      return NextResponse.json({
        message: assistantMessageWithImage,
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
