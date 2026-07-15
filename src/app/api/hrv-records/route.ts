import { NextResponse } from "next/server";
import { createHrvTestRecord, listHrvTestRecords } from "@/lib/hrv";
import { downloadDriveFileBuffer } from "@/lib/google-drive";
import { ImageResizeError } from "@/lib/image-upload";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Visit.visitDate/examDate와 동일한 자정 정규화 원칙(YYYY-MM-DD를 로컬 자정으로 파싱).
function parseTestDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function toNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const patientIdRaw = searchParams.get("patientId");
  const patientId = patientIdRaw ? Number(patientIdRaw) : undefined;
  const rows = await listHrvTestRecords(patientId);
  return NextResponse.json(rows);
}

/**
 * HRV 검사기록 등록(task2.md) — 결과지 이미지는 구글드라이브에서 가져오거나(driveFileId)
 * 직원이 직접 파일을 선택(image)해서 넣을 수 있다(둘 다 동일 파이프라인: 다운로드/읽기 →
 * 리사이즈 저장 → 레코드 생성 → AI 해설 동기 생성).
 */
export async function POST(request: Request) {
  const formData = await request.formData();

  const patientId = Number(formData.get("patientId"));
  const staffUserId = Number(formData.get("staffUserId"));
  const testDate = parseTestDate(formData.get("testDate"));
  const vascularHealthIndex = toNumber(formData.get("vascularHealthIndex"));
  const vascularHealthType = String(formData.get("vascularHealthType") ?? "").trim();
  const avgPulse = toNumber(formData.get("avgPulse"));
  const stressIndex = toNumber(formData.get("stressIndex"));
  const driveFileId = formData.get("driveFileId");
  const imageFile = formData.get("image");

  if (!patientId || !staffUserId) {
    return NextResponse.json({ error: "환자와 담당자를 선택하세요." }, { status: 400 });
  }
  if (!testDate) {
    return NextResponse.json({ error: "검사일자 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (testDate.getTime() > startOfToday().getTime()) {
    return NextResponse.json({ error: "검사일자는 미래 날짜를 선택할 수 없습니다." }, { status: 400 });
  }
  if (vascularHealthIndex === null || avgPulse === null || stressIndex === null || !vascularHealthType) {
    return NextResponse.json(
      { error: "혈관건강지수/혈관건강도/평균맥박/스트레스지수를 모두 입력하세요." },
      { status: 400 },
    );
  }

  let imageBuffer: Buffer;
  if (typeof driveFileId === "string" && driveFileId) {
    try {
      imageBuffer = await downloadDriveFileBuffer(driveFileId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "구글드라이브에서 결과지를 가져오지 못했습니다.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } else if (imageFile instanceof File && imageFile.size > 0) {
    imageBuffer = Buffer.from(await imageFile.arrayBuffer());
  } else {
    return NextResponse.json({ error: "결과지 이미지를 선택하거나 구글드라이브에서 가져오세요." }, { status: 400 });
  }

  try {
    const record = await createHrvTestRecord({
      patientId,
      testDate,
      vascularHealthIndex,
      vascularHealthType,
      avgPulse,
      stressIndex,
      imageBuffer,
      measuredByStaffId: staffUserId,
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    if (err instanceof ImageResizeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
