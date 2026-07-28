import { NextResponse } from "next/server";
import { updateMissionTemplate, setMissionTemplateActive, MISSION_TYPE_QUIZ } from "@/lib/missions";
import { isDirector } from "@/lib/staff-auth";

// 미션뱅크 관리(/settings/missions, task.md 3-1) — 수정/비활성화 둘 다 원장 전용.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const templateId = Number(id);
  if (!Number.isInteger(templateId)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const staffUserId = Number(body.staffUserId);
  if (!staffUserId || !(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 미션을 수정할 수 있습니다." }, { status: 403 });
  }

  // isActive만 넘어오면 비활성화/재활성화 토글 — 그 외 필드가 함께 오면 전체 수정.
  if (typeof body.isActive === "boolean" && body.type === undefined) {
    const updated = await setMissionTemplateActive(templateId, body.isActive);
    return NextResponse.json(updated);
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

  const updated = await updateMissionTemplate(templateId, {
    type,
    category: category.trim(),
    title: title.trim(),
    body: missionBody.trim(),
    quizOptions,
    quizAnswerIndex,
    rewardAmount: Math.round(amount),
  });
  return NextResponse.json(updated);
}
