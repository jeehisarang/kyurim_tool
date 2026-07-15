import { NextResponse } from "next/server";
import { getHrvTestRecord, updateHrvCommentary } from "@/lib/hrv";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getHrvTestRecord(Number(id));
  if (!record) return NextResponse.json({ error: "검사기록을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(record);
}

function toEditableString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// 원장 전용 확인 화면(/examinations/hrv/[id])에서 AI 코멘트 4단 섹션을 수작업 편집 저장
// (task.md — ProgramTeachingCreator와 동일한 필드별 textarea 편집 패턴).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const record = await updateHrvCommentary(Number(id), {
    deviceReading: toEditableString(body.deviceReading),
    clinicalMeaning: toEditableString(body.clinicalMeaning),
    lifestyleGuide: toEditableString(body.lifestyleGuide),
    tcmInterpretation: toEditableString(body.tcmInterpretation),
  });
  return NextResponse.json(record);
}
