import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "teaching");
const PUBLIC_PATH_PREFIX = "/uploads/teaching";

// 원본 용량이 커도 웹에서 보기 적절한 수준으로만 축소해서 저장한다 — 가로 최대 1000px,
// JPEG 품질 78 (티칭 이미지는 사진/도표 위주라 이 정도면 화질 손실이 육안으로 거의 안 보임).
const MAX_WIDTH = 1000;
const JPEG_QUALITY = 78;

export type ResizedImage = {
  path: string;
  originalBytes: number;
  resizedBytes: number;
};

export async function saveResizedImage(file: File): Promise<ResizedImage> {
  const originalBuffer = Buffer.from(await file.arrayBuffer());
  const resizedBuffer = await sharp(originalBuffer)
    .rotate() // EXIF 방향 정보 보정 후 저장(회전된 채 저장되는 것 방지)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}.jpg`;
  await writeFile(path.join(UPLOAD_DIR, filename), resizedBuffer);

  return {
    path: `${PUBLIC_PATH_PREFIX}/${filename}`,
    originalBytes: originalBuffer.length,
    resizedBytes: resizedBuffer.length,
  };
}
