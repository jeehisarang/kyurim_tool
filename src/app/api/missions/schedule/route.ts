import { NextResponse } from "next/server";
import { getMissionSchedule, setMissionScheduleDay } from "@/lib/missions";
import { isDirector } from "@/lib/staff-auth";

// 발송요일(/settings/missions/schedule, task.md 3-2) — 요일 7개 체크박스.
export async function GET() {
  const schedule = await getMissionSchedule();
  return NextResponse.json(schedule);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const staffUserId = Number(body.staffUserId);
  if (!staffUserId || !(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 발송요일을 저장할 수 있습니다." }, { status: 403 });
  }

  const weekday = Number(body.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return NextResponse.json({ error: "잘못된 요일입니다." }, { status: 400 });
  }

  const updated = await setMissionScheduleDay(weekday, Boolean(body.isActive));
  return NextResponse.json(updated);
}
