import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const inputPath = path.resolve(
  process.argv[2] || "data/chat_logs/chat_messages.jsonl",
);
const outputPath = path.resolve(
  process.argv[3] || "data/chat_logs/chat_messages.csv",
);

const columns = [
  "createdAt",
  "createdAtBangkok",
  "clientIp",
  "forwardedFor",
  "realIp",
  "userAgent",
  "conversationId",
  "mode",
  "userContent",
  "userImageName",
  "userImageUrl",
  "assistantContent",
  "assistantImageName",
  "assistantImageUrl",
  "sourceCount",
  "sourceIds",
  "error",
];

function csvCell(value) {
  if (value === null || value === undefined) return "";

  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function bangkokTime(isoDate) {
  if (!isoDate) return "";

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

function rowFromEntry(entry) {
  const sources = Array.isArray(entry.sources) ? entry.sources : [];

  return {
    createdAt: entry.createdAt,
    createdAtBangkok: bangkokTime(entry.createdAt),
    clientIp: entry.clientIp,
    forwardedFor: entry.forwardedFor,
    realIp: entry.realIp,
    userAgent: entry.userAgent,
    conversationId: entry.conversationId,
    mode: entry.mode,
    userContent: entry.userMessage?.content,
    userImageName: entry.userMessage?.imageName,
    userImageUrl: entry.userMessage?.imageUrl,
    assistantContent: entry.assistantMessage?.content,
    assistantImageName: entry.assistantMessage?.imageName,
    assistantImageUrl: entry.assistantMessage?.imageUrl,
    sourceCount: sources.length,
    sourceIds: sources.map((source) => source.id).join("; "),
    error: entry.error,
  };
}

await mkdir(path.dirname(outputPath), { recursive: true });

const reader = readline.createInterface({
  input: createReadStream(inputPath, "utf8"),
  crlfDelay: Infinity,
});
const writer = createWriteStream(outputPath, "utf8");

writer.write(`\uFEFF${columns.join(",")}\n`);

let exportedCount = 0;
let skippedCount = 0;

for await (const line of reader) {
  if (!line.trim()) continue;

  try {
    const entry = JSON.parse(line);
    const row = rowFromEntry(entry);
    writer.write(`${columns.map((column) => csvCell(row[column])).join(",")}\n`);
    exportedCount += 1;
  } catch (error) {
    skippedCount += 1;
    console.warn(
      `Skipped invalid JSONL line ${exportedCount + skippedCount}: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}

await new Promise((resolve, reject) => {
  writer.end(resolve);
  writer.on("error", reject);
});

console.log(`Exported ${exportedCount} chat log rows to ${outputPath}`);
if (skippedCount > 0) {
  console.log(`Skipped ${skippedCount} invalid rows`);
}
