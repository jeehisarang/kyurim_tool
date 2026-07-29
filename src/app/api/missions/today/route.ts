import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getMissionDailyAssignmentForDate,
  upsertMissionDailyAssignment,
  listActiveKillCapPatients,
  getMissionSendLogSummaries,
} from "@/lib/missions";

function parseDateParam(value: string | null): Date {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

// 오늘의 미션 발송(/missions/today, task.md 3-3) — 상단(그날 지정 미션 or 선택 UI) +
// 하단(킬팻캡슐 진행중 환자 리스트) 데이터를 한번에 내려준다.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = parseDateParam(searchParams.get("date"));

  const [assignment, killCapPatients, activeTemplates] = await Promise.all([
    getMissionDailyAssignmentForDate(date),
    listActiveKillCapPatients(),
    prisma.missionTemplate.findMany({ where: { isActive: true }, orderBy: { createdAt: "desc" } }),
  ]);

  // 발송이력 요약(task.md 발송관리 개선) — 목록에 있는 환자만 한 번에 조회.
  const sendLogSummaryMap = await getMissionSendLogSummaries(killCapPatients.map((p) => p.patientId));
  const sendLogSummaries = Object.fromEntries(
    [...sendLogSummaryMap.entries()].map(([patientId, summary]) => [patientId, summary]),
  );

  return NextResponse.json({ assignment, killCapPatients, activeTemplates, sendLogSummaries });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const staffUserId = Number(body.staffUserId);
  const missionTemplateId = Number(body.missionTemplateId);
  if (!staffUserId || !Number.isInteger(missionTemplateId)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const date = parseDateParam(body.date);
  const assignment = await upsertMissionDailyAssignment(date, missionTemplateId, staffUserId);
  return NextResponse.json(assignment);
}
