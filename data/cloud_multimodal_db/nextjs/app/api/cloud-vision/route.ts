import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import cloudTypes from "../../../data/cloud_types.json";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("image") as File | null;
  if (!file) return NextResponse.json({ error: "Missing image" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mime = file.type || "image/jpeg";

  const labels = (cloudTypes as any[]).map(c => `${c.code}: ${c.name_th} (${c.name_en})`).join("\n");

  const response = await openai.responses.create({
    model: "gpt-5-mini",
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: `วิเคราะห์ภาพเมฆนี้ เลือกชนิดที่ใกล้ที่สุดจากรายการเท่านั้น:\n${labels}\n\nตอบ JSON เท่านั้น: {"code":"","name_th":"","confidence":0,"reason_th":[],"caution_th":""}` },
        { type: "input_image", image_url: `data:${mime};base64,${base64}` }
      ]
    }]
  });

  const text = response.output_text;
  let result: any;
  try { result = JSON.parse(text); } catch { result = { raw: text }; }
  const info = (cloudTypes as any[]).find(c => c.code === result.code);
  return NextResponse.json({ result, cloud_info: info ?? null });
}
