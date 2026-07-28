import { NextResponse } from "next/server";
import { listMissionTemplates, createMissionTemplate, MISSION_TYPE_QUIZ } from "@/lib/missions";
import { isDirector } from "@/lib/staff-auth";

// 미션뱅크 관리(/settings/missions, task.md 3-1) — 목록 조회는 인증 없이(설정화면 진입 시
// 미리 필요), 생성/수정/비활성화는 원장 전용(POST /api/trial-campaign과 동일 패턴).
export async function GET() {
  const templates = await listMissionTemplates();
  return NextResponse.json(templates);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const staffUserId = Number(body.staffUserId);
  if (!staffUserId || !(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 미션을 등록할 수 있습니다." }, { status: 403 });
  }

  const { type, category, title, missionBody, quizOptions, quizAnswerIndex, rewardAmount } = body;
  if (!type || !category?.trim() || !title?.trim() || !missionBody?.trim()) {
    return NextResponse.json({ error: "필수 항목을 입력해주세요." }, { status: 400 });
  }
  if (type === MISSION_TYPE_QUIZ) {
    if (!Array.isArray(quizOptions) || quizOptions.length < 2 || !Number.isInteger(quizAnswerIndex)) {
      return NextResponse.json({ error: "퀴즈는 보기 2개 이상과 정답 인덱스가 필요합니다." }, { status: 400 });
    }
  }
  const amount = Number(rewardAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "적립금은 0보다 커야 합니다." }, { status: 400 });
  }

  const template = await createMissionTemplate({
    type,
    category: category.trim(),
    title: title.trim(),
    body: missionBody.trim(),
    quizOptions,
    quizAnswerIndex,
    rewardAmount: Math.round(amount),
  });
  return NextResponse.json(template);
}
