import { NextResponse } from "next/server";
import { readChatQuestionHistory } from "@/lib/chat-log";

export const runtime = "nodejs";

const csvColumns = [
  "askedAt",
  "askedAtBangkok",
  "ip",
  "conversationId",
  "mode",
  "question",
  "answer",
  "error",
  "hasImage",
  "imageName",
] as const;

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";

  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function csvFromEntries(entries: Awaited<ReturnType<typeof readChatQuestionHistory>>) {
  const header = csvColumns.join(",");
  const rows = entries.map((entry) =>
    csvColumns.map((column) => csvCell(entry[column])).join(","),
  );

  return `\uFEFF${[header, ...rows].join("\n")}\n`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || 200);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
    : 200;

  const entries = await readChatQuestionHistory(limit);

  if (url.searchParams.get("format") === "csv") {
    const date = new Date().toISOString().slice(0, 10);

    return new NextResponse(csvFromEntries(entries), {
      headers: {
        "Content-Disposition": `attachment; filename="chat_logs_${date}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  }

  return NextResponse.json({
    entries,
    total: entries.length,
  });
}
