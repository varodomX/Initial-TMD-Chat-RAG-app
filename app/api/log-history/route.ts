import { NextResponse } from "next/server";
import { readChatLogHistory } from "@/lib/chat-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || 200);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
    : 200;

  const entries = await readChatLogHistory(limit);

  return NextResponse.json({
    entries,
    total: entries.length,
  });
}
