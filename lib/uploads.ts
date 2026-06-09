import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const uploadDir = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "data",
  "uploads",
);

const mimeToExtension: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const extensionToMime: Record<string, string> = {
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export type StoredUpload = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
};

export function isAllowedImageType(mimeType: string) {
  return Boolean(mimeToExtension[mimeType]);
}

export function mimeTypeForUploadName(name: string) {
  const extension = path.extname(name).slice(1).toLowerCase();

  return extensionToMime[extension] || "application/octet-stream";
}

export function uploadPath(name: string) {
  const safeName = path.basename(name);

  if (safeName !== name) {
    throw new Error("Invalid upload file name.");
  }

  return path.join(uploadDir, safeName);
}

export async function saveImageUpload(file: File): Promise<StoredUpload> {
  if (!isAllowedImageType(file.type)) {
    throw new Error("รองรับเฉพาะไฟล์รูปภาพ png, jpg, webp หรือ gif");
  }

  if (file.size > 8 * 1024 * 1024) {
    throw new Error("ไฟล์รูปต้องไม่เกิน 8 MB");
  }

  await mkdir(uploadDir, { recursive: true });

  const extension = mimeToExtension[file.type];
  const id = `${crypto.randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await writeFile(uploadPath(id), bytes);

  return {
    id,
    name: file.name,
    mimeType: file.type,
    size: file.size,
    url: `/api/uploads/${id}`,
  };
}

export async function readUploadAsDataUrl(url: string) {
  const fileName = path.basename(url);
  const filePath = uploadPath(fileName);
  const buffer = await readFile(filePath);
  const mimeType = mimeTypeForUploadName(fileName);

  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
