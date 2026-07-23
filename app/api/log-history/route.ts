import { NextResponse } from "next/server";
import { readChatLogHistory } from "@/lib/chat-log";

export const runtime = "nodejs";

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || 200);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
    : 200;

  const entries = (await readChatLogHistory(limit)).map((entry) => ({
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
  }));

  return NextResponse.json({
    entries,
    total: entries.length,
  });
}
