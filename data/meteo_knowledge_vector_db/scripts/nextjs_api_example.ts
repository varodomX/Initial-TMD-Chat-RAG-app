// Example: app/api/rag-local/route.ts
// ใช้ได้เมื่อ deploy บน server ที่อ่านไฟล์ local ได้ ไม่เหมาะกับ Vercel ถ้าไฟล์ใหญ่
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";

export async function POST(req: NextRequest) {
  const { question } = await req.json();
  const root = path.join(process.cwd(), "data", "meteo_knowledge_vector_db");
  const script = path.join(root, "scripts", "query.py");

  return new Promise((resolve) => {
    execFile("python3", [script, question, "--top-k", "5"], { cwd: root }, (err, stdout, stderr) => {
      if (err) return resolve(NextResponse.json({ error: stderr || err.message }, { status: 500 }));
      resolve(NextResponse.json({ results: JSON.parse(stdout) }));
    });
  });
}
