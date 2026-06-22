import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";

export async function POST(req: NextRequest) {
  const { question, k = 5 } = await req.json();
  if (!question) return NextResponse.json({ error: "Missing question" }, { status: 400 });

  const dbPath = path.join(process.cwd(), "data", "km_ai_sob_vector_db");
  const scriptPath = path.join(dbPath, "scripts", "query.py");

  return new Promise((resolve) => {
    execFile("python3", [scriptPath, question, "--k", String(k)], { cwd: dbPath }, (error, stdout, stderr) => {
      if (error) return resolve(NextResponse.json({ error: stderr || error.message }, { status: 500 }));
      resolve(NextResponse.json({ question, results: stdout }));
    });
  });
}
