import { NextResponse } from "next/server";
import { isDirector } from "@/lib/staff-auth";
import { setExamReminderCycleActive, isExamReminderExamType } from "@/lib/exam-reminders";

/**
 * 검사 해피톡(task.md) 온/오프 토글 — 환자+검사종류별 ExamReminderCycle.isActive를
 * 바꾼다. core-profile PATCH와 동일하게 원장 전용(서버단 재검증).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patientId = Number(id);
  const body = await request.json();

  const staffUserId = Number(body.staffUserId);
  if (!staffUserId) {
    return NextResponse.json({ error: "staffUserId가 필요합니다." }, { status: 400 });
  }
  if (!(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 검사 리마인더 설정을 변경할 수 있습니다." }, { status: 403 });
  }

  const { examType, isActive } = body;
  if (typeof examType !== "string" || !isExamReminderExamType(examType)) {
    return NextResponse.json({ error: "검사 종류가 올바르지 않습니다." }, { status: 400 });
  }
  if (typeof isActive !== "boolean") {
    return NextResponse.json({ error: "isActive 값이 필요합니다." }, { status: 400 });
  }

  try {
    await setExamReminderCycleActive(patientId, examType, isActive);
  } catch {
    return NextResponse.json({ error: "아직 검사 이력이 없어 리마인더를 설정할 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
