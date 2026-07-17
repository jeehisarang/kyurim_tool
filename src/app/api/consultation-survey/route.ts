import { NextResponse } from "next/server";
import {
  listActiveCategoriesWithQuestions,
  getLatestChecklistResponse,
  getLatestAnswerMap,
  getChecklistHistory,
  submitChecklistResponse,
  isValidAnswerArray,
} from "@/lib/tcm-checklist";

// 증상 패턴 프로필 원장실 입력(task.md, 독립 메뉴 "상담설문") — 인증 경로. patientId는
// 스태프가 이미 로그인한 화면에서 직접 넘기는 값이라 그대로 신뢰한다(examinations/new 등
// 기존 스태프 API와 동일 원칙).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const patientId = Number(searchParams.get("patientId"));
  if (!patientId) return NextResponse.json({ error: "patientId가 필요합니다." }, { status: 400 });

  const [categories, latestResponse, answerMap, history] = await Promise.all([
    listActiveCategoriesWithQuestions(),
    getLatestChecklistResponse(patientId),
    getLatestAnswerMap(patientId),
    getChecklistHistory(patientId),
  ]);

  return NextResponse.json({
    categories,
    latestResponse,
    answers: Object.fromEntries(answerMap),
    history,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const patientId = Number(body.patientId);
  const staffUserId = Number(body.staffUserId);
  if (!patientId || !staffUserId) {
    return NextResponse.json({ error: "patientId/staffUserId가 필요합니다." }, { status: 400 });
  }
  if (!isValidAnswerArray(body.answers)) {
    return NextResponse.json({ error: "answers의 questionId/score(0/1/2) 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const response = await submitChecklistResponse({
    patientId,
    source: "IN_CLINIC",
    submittedByStaffId: staffUserId,
    otherSymptomsText: typeof body.otherSymptomsText === "string" ? body.otherSymptomsText : null,
    answers: body.answers,
  });

  return NextResponse.json(response);
}
