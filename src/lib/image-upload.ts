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

// 이벤트 이미지 생성기(task.md) — 배경 원본은 티칭 이미지와 동일한 리사이즈 방식/저장
// 규칙을 쓰되 폴더만 분리한다.
const EVENT_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "event-image");
const EVENT_PUBLIC_PATH_PREFIX = "/uploads/event-image";

export async function saveEventBackgroundImage(file: File): Promise<ResizedImage> {
  const originalBuffer = Buffer.from(await file.arrayBuffer());
  const resizedBuffer = await sharp(originalBuffer)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  await mkdir(EVENT_UPLOAD_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}.jpg`;
  await writeFile(path.join(EVENT_UPLOAD_DIR, filename), resizedBuffer);

  return {
    path: `${EVENT_PUBLIC_PATH_PREFIX}/${filename}`,
    originalBytes: originalBuffer.length,
    resizedBytes: resizedBuffer.length,
  };
}

// 합성 결과(문구가 얹힌 최종 이미지)는 브라우저 Canvas가 이미 적정 해상도로 렌더링해
// 보낸 PNG를 그대로 저장한다 — sharp로 재압축하면 텍스트 가장자리가 뭉개질 수 있어 피한다.
export async function saveCompositeImage(file: File): Promise<{ path: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  await mkdir(EVENT_UPLOAD_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}.png`;
  await writeFile(path.join(EVENT_UPLOAD_DIR, filename), buffer);
  return { path: `${EVENT_PUBLIC_PATH_PREFIX}/${filename}` };
}
