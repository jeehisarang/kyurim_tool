import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "teaching");
const PUBLIC_PATH_PREFIX = "/uploads/teaching";

// 원장실에서 Claude Design 등으로 만든 5MB+ 고화질 원본을 그대로 올려도 되도록(task.md) —
// 가로/세로 중 긴 변 기준 1080px, JPEG 품질 80%로 축소 저장한다(목표 200~500KB). width와
// height를 함께 주고 fit:"inside"를 써야 세로가 긴 이미지(포트레이트)에서도 "긴 변"이
// 실제로 1080px 이내로 제한된다 — width만 주면 세로 사진은 height가 1080을 넘어설 수 있다.
const PROGRAM_TEACHING_MAX_DIMENSION = 1080;
const PROGRAM_TEACHING_JPEG_QUALITY = 80;

export type ResizedImage = {
  path: string;
  originalBytes: number;
  resizedBytes: number;
};

// sharp가 손상/미지원 이미지 파일에서 던지는 예외를 그대로 흘려보내면 Next.js가 (dev에서는
// HTML 에러 오버레이를) 응답해 클라이언트의 res.json()이 깨지고 "서버에 연결하지 못했습니다"
// 같은 엉뚱한 메시지로 보인다(task.md 배경 — 실제 원인은 이거였다) — 원인을 알 수 있는
// 전용 에러로 감싸서 라우트가 명확한 JSON 에러 응답을 내려줄 수 있게 한다.
export class ImageResizeError extends Error {
  constructor(cause?: unknown) {
    super("이미지 처리 중 문제가 발생했습니다. 파일이 손상되지 않았는지 확인해주세요.");
    this.name = "ImageResizeError";
    if (cause !== undefined) this.cause = cause;
  }
}

export async function saveResizedImage(file: File): Promise<ResizedImage> {
  const originalBuffer = Buffer.from(await file.arrayBuffer());

  let resizedBuffer: Buffer;
  try {
    resizedBuffer = await sharp(originalBuffer)
      .rotate() // EXIF 방향 정보 보정 후 저장(회전된 채 저장되는 것 방지)
      .resize({
        width: PROGRAM_TEACHING_MAX_DIMENSION,
        height: PROGRAM_TEACHING_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: PROGRAM_TEACHING_JPEG_QUALITY })
      .toBuffer();
  } catch (err) {
    throw new ImageResizeError(err);
  }

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
// 규칙을 쓰되 폴더만 분리한다. 이번 이미지 업로드 개선(task.md)은 프로그램티칭 전용
// 스코프라 이벤트 배경은 기존 값(가로 최대 1000px, 품질 78%)을 그대로 유지한다.
const EVENT_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "event-image");
const EVENT_PUBLIC_PATH_PREFIX = "/uploads/event-image";
const EVENT_MAX_WIDTH = 1000;
const EVENT_JPEG_QUALITY = 78;

export async function saveEventBackgroundImage(file: File): Promise<ResizedImage> {
  const originalBuffer = Buffer.from(await file.arrayBuffer());
  const resizedBuffer = await sharp(originalBuffer)
    .rotate()
    .resize({ width: EVENT_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: EVENT_JPEG_QUALITY })
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

// HRV 결과지(task2.md) — 마케팅 사진과 달리 작은 숫자/그래프가 담긴 데이터 문서라, 다른
// 업로드보다 해상도/화질을 높게 유지한다("환자와 함께보기"의 줌 기능으로 더 확대해서 볼
// 수 있긴 하지만, 원본 자체가 너무 뭉개지면 줌해도 읽히지 않는다).
const HRV_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "hrv");
const HRV_PUBLIC_PATH_PREFIX = "/uploads/hrv";
const HRV_MAX_DIMENSION = 1600;
const HRV_JPEG_QUALITY = 88;

export async function saveHrvResultImage(buffer: Buffer): Promise<ResizedImage> {
  let resizedBuffer: Buffer;
  try {
    resizedBuffer = await sharp(buffer)
      .rotate()
      .resize({
        width: HRV_MAX_DIMENSION,
        height: HRV_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: HRV_JPEG_QUALITY })
      .toBuffer();
  } catch (err) {
    throw new ImageResizeError(err);
  }

  await mkdir(HRV_UPLOAD_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}.jpg`;
  await writeFile(path.join(HRV_UPLOAD_DIR, filename), resizedBuffer);

  return {
    path: `${HRV_PUBLIC_PATH_PREFIX}/${filename}`,
    originalBytes: buffer.length,
    resizedBytes: resizedBuffer.length,
  };
}

// 체험이벤트 캠페인 히어로 이미지(task.md 1-5) — 원장실 학술자료 이미지(saveResizedImage)와
// 동일한 규격(1080px/80%)을 쓰되 폴더만 분리한다.
const TRIAL_CAMPAIGN_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "trial-campaign");
const TRIAL_CAMPAIGN_PUBLIC_PATH_PREFIX = "/uploads/trial-campaign";
const TRIAL_CAMPAIGN_MAX_DIMENSION = 1080;
const TRIAL_CAMPAIGN_JPEG_QUALITY = 80;

export async function saveTrialCampaignHeroImage(file: File): Promise<ResizedImage> {
  const originalBuffer = Buffer.from(await file.arrayBuffer());

  let resizedBuffer: Buffer;
  try {
    resizedBuffer = await sharp(originalBuffer)
      .rotate()
      .resize({
        width: TRIAL_CAMPAIGN_MAX_DIMENSION,
        height: TRIAL_CAMPAIGN_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: TRIAL_CAMPAIGN_JPEG_QUALITY })
      .toBuffer();
  } catch (err) {
    throw new ImageResizeError(err);
  }

  await mkdir(TRIAL_CAMPAIGN_UPLOAD_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}.jpg`;
  await writeFile(path.join(TRIAL_CAMPAIGN_UPLOAD_DIR, filename), resizedBuffer);

  return {
    path: `${TRIAL_CAMPAIGN_PUBLIC_PATH_PREFIX}/${filename}`,
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

// HRV AI 코멘트 비전 입력용(task.md 작업 B) — 저장된 결과지 이미지를 base64로 다시 읽어
// OpenAI 비전 입력에 붙인다. 파일이 없거나(삭제됨 등) 읽기 실패 시 null만 반환하고 절대
// throw하지 않는다 — 이미지 판독은 AI 코멘트 생성의 부가 재료일 뿐, 이게 실패했다고 코멘트
// 생성 전체(텍스트 기반)가 막혀서는 안 된다.
export async function readUploadedImageAsBase64(publicPath: string): Promise<string | null> {
  const filePath = path.join(process.cwd(), "public", ...publicPath.split("/").filter(Boolean));
  try {
    const buffer = await readFile(filePath);
    return buffer.toString("base64");
  } catch {
    return null;
  }
}

// EventImage 완전 삭제/이미지 교체(수정) 시 디스크에서 파일을 정리한다 — publicPath는
// saveResizedImage 등이 반환한 "/uploads/..." 형태. 이미 없는 파일(ENOENT)은 조용히 무시.
export async function deleteUploadedFile(publicPath: string): Promise<void> {
  const filePath = path.join(process.cwd(), "public", ...publicPath.split("/").filter(Boolean));
  try {
    await unlink(filePath);
  } catch {
    // 파일이 이미 없거나 접근 불가 — 삭제 자체를 막을 이유는 아니므로 무시.
  }
}
