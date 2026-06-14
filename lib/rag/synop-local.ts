import { existsSync } from "fs";
import path from "path";
import { promisify } from "util";
import { execFile } from "child_process";
import type { Retriever } from "./types";

const execFileAsync = promisify(execFile);

type SynopRecord = {
  id: string;
  source_file: string;
  page: number;
  chunk_index: number;
  text: string;
  score: number;
};

const dbPath = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "data",
  "synop_vector_db",
);
const queryScript = path.join(dbPath, "query.py");

function canRunLocalPythonRetriever() {
  return process.env.VERCEL !== "1" || process.env.ALLOW_LOCAL_PYTHON_RAG === "1";
}

export function hasSynopLocalVectorDb() {
  return canRunLocalPythonRetriever() && existsSync(queryScript);
}

export function createSynopLocalRetriever(): Retriever {
  return {
    async search(query, limit) {
      const configuredPython = process.env.PYTHON_BIN;
      const python = configuredPython
        ? path.isAbsolute(configuredPython)
          ? configuredPython
          : path.join(
              /*turbopackIgnore: true*/ process.cwd(),
              configuredPython,
            )
        : "python3";
      const { stdout } = await execFileAsync(
        python,
        [queryScript, "--json", "--k", String(limit), query],
        {
          cwd: dbPath,
          maxBuffer: 1024 * 1024 * 10,
        },
      );

      const records = JSON.parse(stdout) as SynopRecord[];

      return records.map((record) => ({
        id: record.id,
        content: record.text,
        metadata: {
          title: `Synop(1).pdf page ${record.page}`,
          source: record.source_file,
          page: record.page,
          chunk: record.chunk_index,
          vectorDb: "synop-local-tfidf",
        },
        score: record.score,
      }));
    },
  };
}
