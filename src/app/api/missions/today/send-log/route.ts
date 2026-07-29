import { NextResponse } from "next/server";
import { createMissionSendLog } from "@/lib/missions";

// 미션톡 발송이력 기록(task.md 발송관리 개선) — "복사" 버튼 클릭 시점에 호출된다.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const patientId = Number(body.patientId);
  const missionTemplateId = Number(body.missionTemplateId);
  const staffUserId = Number(body.staffUserId);

  if (!patientId || !missionTemplateId || !staffUserId) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const log = await createMissionSendLog({ patientId, missionTemplateId, sentByStaffId: staffUserId });
  return NextResponse.json(log, { status: 201 });
}
