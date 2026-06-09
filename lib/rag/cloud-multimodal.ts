import { existsSync, readFileSync } from "fs";
import path from "path";
import type { RagSource, Retriever } from "./types";

type CloudType = {
  code: string;
  name_th: string;
  name_en: string;
  level_th: string;
  visual_cues_th: string[];
  weather_th: string;
  keywords_th: string[];
};

type CloudImageManifestRecord = {
  id: string;
  code: string;
  filePath: string;
};

const dbPath = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "data",
  "cloud_multimodal_db",
);
const cloudTypesPath = path.join(dbPath, "data", "cloud_types.json");
const manifestPath = path.join(dbPath, "data", "cloud_image_manifest.csv");

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(text: string) {
  return normalize(text)
    .split(/[\s,.;:()/_|'"“”‘’!?*-]+/u)
    .filter(Boolean);
}

function loadCloudTypes() {
  if (!existsSync(cloudTypesPath)) return [];

  return JSON.parse(readFileSync(cloudTypesPath, "utf8")) as CloudType[];
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function loadManifest() {
  if (!existsSync(manifestPath)) return [];

  return readFileSync(manifestPath, "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line): CloudImageManifestRecord | undefined => {
      const [id, code, filePath] = parseCsvLine(line);
      if (!id || !code || !filePath) return undefined;

      return { id, code, filePath };
    })
    .filter((record): record is CloudImageManifestRecord => Boolean(record));
}

function firstExistingImageUrl(code: string) {
  const record = loadManifest().find((item) => {
    if (item.code !== code) return false;
    return existsSync(path.join(dbPath, item.filePath));
  });

  if (!record) return undefined;

  return `/api/cloud-images/${record.filePath}`;
}

function scoreCloudType(query: string, cloud: CloudType) {
  const normalizedQuery = normalize(query);
  const queryTokens = tokenize(query);
  let score = 0;

  if (normalizedQuery.includes(normalize(cloud.code))) score += 12;
  if (normalizedQuery.includes(normalize(cloud.name_en))) score += 9;
  if (normalizedQuery.includes(normalize(cloud.name_th))) score += 9;

  for (const keyword of cloud.keywords_th) {
    if (normalizedQuery.includes(normalize(keyword))) score += 3;
  }

  const searchableText = normalize(
    [
      cloud.code,
      cloud.name_th,
      cloud.name_en,
      cloud.level_th,
      cloud.weather_th,
      ...cloud.visual_cues_th,
      ...cloud.keywords_th,
    ].join(" "),
  );

  for (const token of queryTokens) {
    if (token.length > 1 && searchableText.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function toSource(cloud: CloudType, score: number): RagSource {
  const imageUrl = firstExistingImageUrl(cloud.code);

  return {
    id: `cloud_${cloud.code}`,
    content: [
      `${cloud.code} (${cloud.name_en} / ${cloud.name_th})`,
      `ระดับ: ${cloud.level_th}`,
      `ลักษณะสังเกต: ${cloud.visual_cues_th.join(", ")}`,
      `สภาพอากาศที่มักเกี่ยวข้อง: ${cloud.weather_th}`,
    ].join("\n"),
    metadata: {
      title: `${cloud.code} - ${cloud.name_en} (${cloud.name_th})`,
      source: "cloud_multimodal_db/data/cloud_types.json",
      cloudCode: cloud.code,
      imageUrl,
      vectorDb: "cloud-multimodal-db",
    },
    score,
  };
}

export function hasCloudMultimodalDb() {
  return existsSync(cloudTypesPath);
}

export function createCloudMultimodalRetriever(): Retriever {
  return {
    async search(query, limit) {
      return loadCloudTypes()
        .map((cloud) => ({ cloud, score: scoreCloudType(query, cloud) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item) => toSource(item.cloud, item.score / 20));
    },
  };
}
