import { existsSync, readFileSync } from "fs";
import path from "path";
import type { RagSource, Retriever } from "./types";

type CustomKnowledgeRecord = {
  id: string;
  title: string;
  tags?: string[];
  content: string;
};

const dbPath = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "data",
  "custom_knowledge_vector_db",
);
const chunksPath = path.join(dbPath, "chunks.jsonl");

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(text: string) {
  return normalize(text)
    .split(/[\s,.;:()/_|'"“”‘’!?*=><-]+/u)
    .filter((token) => token.length > 1);
}

function loadRecords() {
  if (!existsSync(chunksPath)) return [];

  return readFileSync(chunksPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as CustomKnowledgeRecord);
}

function scoreRecord(query: string, record: CustomKnowledgeRecord) {
  const normalizedQuery = normalize(query);
  const queryTokens = tokenize(query);
  const title = normalize(record.title);
  const tags = normalize((record.tags ?? []).join(" "));
  const content = normalize(record.content);
  let score = 0;

  for (const token of queryTokens) {
    if (title.includes(token)) score += 6;
    if (tags.includes(token)) score += 5;
    if (content.includes(token)) score += 1;
  }

  if (normalizedQuery.includes("ww")) score += 12;
  if (normalizedQuery.includes("present")) score += 6;
  if (normalizedQuery.includes("past")) score += 6;
  if (normalizedQuery.includes("w1") || normalizedQuery.includes("w2")) score += 8;
  if (normalizedQuery.includes("ix") || normalizedQuery.includes("ir")) score += 8;
  if (normalizedQuery.includes("tr")) score += 6;

  return score;
}

function toSource(record: CustomKnowledgeRecord, score: number): RagSource {
  return {
    id: record.id,
    content: record.content,
    metadata: {
      title: record.title,
      source: "custom_knowledge_vector_db/chunks.jsonl",
      tags: record.tags ?? [],
      vectorDb: "custom-knowledge-local",
    },
    score,
  };
}

export function hasCustomKnowledgeDb() {
  return existsSync(chunksPath);
}

export function createCustomKnowledgeRetriever(): Retriever {
  return {
    async search(query, limit) {
      return loadRecords()
        .map((record) => ({ record, score: scoreRecord(query, record) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item) => toSource(item.record, Math.min(item.score / 30, 1)));
    },
  };
}
