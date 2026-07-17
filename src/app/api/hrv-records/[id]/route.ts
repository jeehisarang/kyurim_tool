import { NextResponse } from "next/server";
import { getHrvTestRecord, updateHrvCommentary, deleteHrvTestRecord } from "@/lib/hrv";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getHrvTestRecord(Number(id));
  if (!record) return NextResponse.json({ error: "검사기록을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(record);
}

function toEditableString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// 원장 전용 확인 화면(/examinations/hrv/[id])에서 건강 리포트 카드를 수작업 편집 저장
// (task.md — ProgramTeachingCreator와 동일한 필드별 textarea 편집 패턴). 건강 리포트
// (HEALTH_REPORT_V1)는 headline/tcmInterpretation/progression/treatmentAndLifestyle
// 4개 키를 쓰고, 레거시 레코드는 clinicalMeaning도 함께 받는다(구버전 카드2 편집용,
// updateHrvCommentary 참고).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const record = await updateHrvCommentary(Number(id), {
    headline: toEditableString(body.headline),
    clinicalMeaning: toEditableString(body.clinicalMeaning),
    treatmentAndLifestyle: toEditableString(body.treatmentAndLifestyle),
    tcmInterpretation: toEditableString(body.tcmInterpretation),
    progression: toEditableString(body.progression),
  });
  return NextResponse.json(record);
}

// 소프트 삭제(task2.md) — deleteBodyCompositionRecord/deleteStrengthTestRecord와 동일한
// 권한 원칙(별도 제한 없음, Visit 삭제와 동일 신뢰 모델).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteHrvTestRecord(Number(id));
  return NextResponse.json({ success: true });
}
