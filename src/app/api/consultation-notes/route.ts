import { NextResponse } from "next/server";
import { createConsultationNote, listConsultationNotesForPatient } from "@/lib/consultation-notes";
import { isDirector } from "@/lib/staff-auth";

// 읽기는 누구나(원장 상담모드 + 환자 통합뷰 읽기전용 표시가 공유하는 엔드포인트).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const patientId = Number(searchParams.get("patientId"));
  if (!patientId) {
    return NextResponse.json({ error: "patientId가 필요합니다." }, { status: 400 });
  }
  const notes = await listConsultationNotesForPatient(patientId);
  return NextResponse.json(notes);
}

// 작성은 원장 전용 — 클라이언트 UI 숨김과 별개로 서버에서도 role을 재확인한다
// (환자 핵심프로필의 /api/patients/[id]/core-profile과 동일 원칙).
export async function POST(request: Request) {
  const body = await request.json();
  const staffUserId = Number(body.createdByStaffId);
  if (!staffUserId) {
    return NextResponse.json({ error: "createdByStaffId가 필요합니다." }, { status: 400 });
  }
  if (!(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 상담을 작성할 수 있습니다." }, { status: 403 });
  }

  const patientId = Number(body.patientId);
  const consultationTypeId = Number(body.consultationTypeId);
  const rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";
  const convertedChartText =
    typeof body.convertedChartText === "string" && body.convertedChartText.trim()
      ? body.convertedChartText.trim()
      : null;

  if (!patientId || !consultationTypeId || !rawText) {
    return NextResponse.json(
      { error: "환자, 상담유형, 상담 내용을 모두 확인해주세요." },
      { status: 400 },
    );
  }

  const note = await createConsultationNote({
    patientId,
    consultationTypeId,
    rawText,
    convertedChartText,
    createdByStaffId: staffUserId,
  });
  return NextResponse.json(note, { status: 201 });
}
