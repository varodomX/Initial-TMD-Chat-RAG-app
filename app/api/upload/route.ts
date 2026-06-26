import { NextResponse } from "next/server";
import {
  DAILY_IMAGE_LIMIT,
  incrementDailyQuota,
  quotaErrorMessage,
} from "@/lib/daily-quota";
import { isAllowedImageType, saveImageUpload } from "@/lib/uploads";

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

    if (!isAllowedImageType(file.type)) {
      return NextResponse.json(
        { error: "รองรับเฉพาะไฟล์รูปภาพ png, jpg, webp หรือ gif" },
        { status: 400 },
      );
    }

    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json(
        { error: "ไฟล์รูปต้องไม่เกิน 8 MB" },
        { status: 400 },
      );
    }

    const quota = await incrementDailyQuota(request, "image");

    if (!quota.allowed) {
      return NextResponse.json(
        { error: quotaErrorMessage("image", DAILY_IMAGE_LIMIT) },
        { status: 429 },
      );
    }

    const image = await saveImageUpload(file);

    return NextResponse.json({ image, quota });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
