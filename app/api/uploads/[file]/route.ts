import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { mimeTypeForUploadName, uploadPath } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
) {
  try {
    const { file } = await context.params;
    const bytes = await readFile(uploadPath(file));

    return new NextResponse(bytes, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": mimeTypeForUploadName(file),
      },
    });
  } catch {
    return NextResponse.json({ error: "ไม่พบรูปภาพ" }, { status: 404 });
  }
}
