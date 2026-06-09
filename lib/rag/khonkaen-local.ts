import { execFile } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { promisify } from "util";
import type { Retriever } from "./types";

const execFileAsync = promisify(execFile);

type KhonKaenRecord = {
  id: string;
  source?: string;
  station?: string;
  wmo?: string;
  title: string;
  text: string;
  score: number;
};

const dbPath = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "data",
  "khonkaen_station_vector_db",
);
const searchScript = path.join(dbPath, "search.py");
const vectorDbPath = path.join(dbPath, "vector_db.joblib");

function getPythonBin() {
  const configuredPython = process.env.PYTHON_BIN;

  if (!configuredPython) return "python3";

  return path.isAbsolute(configuredPython)
    ? configuredPython
    : path.join(/*turbopackIgnore: true*/ process.cwd(), configuredPython);
}

export function hasKhonKaenLocalVectorDb() {
  return existsSync(searchScript) && existsSync(vectorDbPath);
}

export function createKhonKaenLocalRetriever(): Retriever {
  return {
    async search(query, limit) {
      const { stdout } = await execFileAsync(
        getPythonBin(),
        [searchScript, "--json", "--k", String(limit), query],
        {
          cwd: dbPath,
          maxBuffer: 1024 * 1024 * 10,
        },
      );

      const records = JSON.parse(stdout) as KhonKaenRecord[];

      return records.map((record) => ({
        id: record.id,
        content: [
          record.station ? `สถานี: ${record.station}` : undefined,
          record.wmo ? `WMO: ${record.wmo}` : undefined,
          record.text,
        ]
          .filter(Boolean)
          .join("\n"),
        metadata: {
          title: record.title,
          source: record.source ?? "khonkaen_station_vector_db/chunks.jsonl",
          station: record.station,
          wmo: record.wmo,
          vectorDb: "khonkaen-station-local-tfidf",
        },
        score: record.score,
      }));
    },
  };
}
