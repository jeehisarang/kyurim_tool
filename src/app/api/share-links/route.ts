import { NextResponse } from "next/server";
import { createOrReuseShareLink, InvalidShareLinkComboError } from "@/lib/share-links";

// 검사톡(task.md) — [{ examType, examRecordId }, ...] 형태만 허용. 형식이 안 맞는 항목은
// 조용히 걸러낸다(악의적 입력이 아니라 클라이언트 버그를 상정한 방어적 파싱).
function parseExamRecords(value: unknown): { examType: string; examRecordId: number }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (v): v is { examType: unknown; examRecordId: unknown } =>
        v && typeof v === "object" && "examType" in v && "examRecordId" in v,
    )
    .map((v) => ({ examType: String(v.examType), examRecordId: Number(v.examRecordId) }))
    .filter((v) => v.examType && Number.isFinite(v.examRecordId));
}

export async function POST(request: Request) {
  const body = await request.json();
  const patientId = Number(body.patientId);
  const teachingPageId = body.teachingPageId != null ? Number(body.teachingPageId) : null;
  const eventImageId = body.eventImageId != null ? Number(body.eventImageId) : null;
  const examRecords = parseExamRecords(body.examRecords);
  const createdByStaffId = Number(body.createdByStaffId);

  if (!patientId || !createdByStaffId) {
    return NextResponse.json({ error: "환자와 작성자를 확인해주세요." }, { status: 400 });
  }

  try {
    const link = await createOrReuseShareLink({
      patientId,
      teachingPageId,
      eventImageId,
      examRecords,
      createdByStaffId,
    });
    return NextResponse.json(link, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidShareLinkComboError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "공유링크 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
