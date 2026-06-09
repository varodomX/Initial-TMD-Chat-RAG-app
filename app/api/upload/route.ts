import { NextResponse } from "next/server";
import { saveImageUpload } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "ต้องแนบไฟล์รูปภาพ" },
        { status: 400 },
      );
    }

    const image = await saveImageUpload(file);

    return NextResponse.json({ image });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
