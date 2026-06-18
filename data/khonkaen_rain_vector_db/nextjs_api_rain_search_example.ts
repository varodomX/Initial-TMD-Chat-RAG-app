// app/api/rain-search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";

export async function POST(req: NextRequest) {
  const { query, topK = 5 } = await req.json();
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  const script = path.join(process.cwd(), "data", "khonkaen_rain_vector_db", "scripts", "query.py");
  return new Promise((resolve) => {
    execFile("python3", [script, query, "--top-k", String(topK)], (error, stdout, stderr) => {
      if (error) return resolve(NextResponse.json({ error: stderr || error.message }, { status: 500 }));
      resolve(NextResponse.json({ query, results: stdout }));
    });
  });
}
