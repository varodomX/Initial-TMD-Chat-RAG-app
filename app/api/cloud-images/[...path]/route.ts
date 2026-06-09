import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { mimeTypeForUploadName } from "@/lib/uploads";

const cloudDbPath = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "data",
  "cloud_multimodal_db",
);

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: parts } = await context.params;
    const relativePath = parts.join("/");
    const safePath = path.normalize(relativePath);

    if (safePath.startsWith("..") || path.isAbsolute(safePath)) {
      return NextResponse.json({ error: "Invalid image path" }, { status: 400 });
    }

    const bytes = await readFile(path.join(cloudDbPath, safePath));

    return new NextResponse(bytes, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": mimeTypeForUploadName(safePath),
      },
    });
  } catch {
    return NextResponse.json({ error: "ไม่พบรูปภาพ" }, { status: 404 });
  }
}
