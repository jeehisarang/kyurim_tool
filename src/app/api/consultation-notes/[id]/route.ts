import { NextResponse } from "next/server";
import { deleteConsultationNote, updateConsultationNote } from "@/lib/consultation-notes";
import { isDirector } from "@/lib/staff-auth";

// Visit.visitDate/announcements와 동일한 자정 정규화 원칙(YYYY-MM-DD를 로컬 자정으로 파싱).
function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

// 오타/잘못 기재 정정 전용 PATCH — 원장 전용(작성과 동일한 서버단 role 재검증).
// 새 레코드를 생성하지 않고 rawText/convertedChartText/visitDate를 그대로 덮어쓴다.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const staffUserId = Number(body.staffUserId);
  if (!staffUserId) {
    return NextResponse.json({ error: "staffUserId가 필요합니다." }, { status: 400 });
  }
  if (!(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 상담 기록을 수정할 수 있습니다." }, { status: 403 });
  }

  const rawText = typeof body.rawText === "string" ? body.rawText.trim() : undefined;
  const convertedChartText =
    typeof body.convertedChartText === "string"
      ? body.convertedChartText.trim() || null
      : undefined;

  if (rawText !== undefined && rawText.length === 0) {
    return NextResponse.json({ error: "상담 내용을 입력하세요." }, { status: 400 });
  }

  const visitDate = parseDate(body.visitDate);
  if (visitDate === null) {
    return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const note = await updateConsultationNote(Number(id), { visitDate, rawText, convertedChartText });
  return NextResponse.json(note);
}

// 하드 삭제 — 법적 의무기록이 아니라 내부 참고용 원문/초안이라 완전 삭제 허용(task.md 지시).
// 원장 전용(서버단 role 재검증), 실수 방지는 클라이언트 확인창으로 처리.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const staffUserId = Number(body.staffUserId);
  if (!staffUserId) {
    return NextResponse.json({ error: "staffUserId가 필요합니다." }, { status: 400 });
  }
  if (!(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 상담 기록을 삭제할 수 있습니다." }, { status: 403 });
  }

  await deleteConsultationNote(Number(id));
  return NextResponse.json({ success: true });
}
