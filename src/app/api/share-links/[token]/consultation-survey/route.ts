import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  listActiveCategoriesWithQuestions,
  getLatestChecklistResponse,
  getLatestAnswerMap,
  submitChecklistResponse,
  isValidAnswerArray,
} from "@/lib/tcm-checklist";

// 인증 없는 공개 엔드포인트(/s/{token} 4번째 섹션 "상담설문" 전용) — event-cta-click과 동일
// 원칙으로 patientId를 클라이언트가 아니라 token → PatientShareLink.patientId 서버 조회로
// 해석한다(클라이언트가 임의 환자ID를 보내 다른 환자 데이터를 조작하는 것을 원천 차단).
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await prisma.patientShareLink.findUnique({ where: { token } });
  if (!link) return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 404 });

  const [categories, latestResponse, answerMap] = await Promise.all([
    listActiveCategoriesWithQuestions(),
    getLatestChecklistResponse(link.patientId),
    getLatestAnswerMap(link.patientId),
  ]);

  return NextResponse.json({
    categories,
    latestResponse,
    answers: Object.fromEntries(answerMap),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await prisma.patientShareLink.findUnique({ where: { token } });
  if (!link) return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 404 });

  const body = await request.json();
  if (!isValidAnswerArray(body.answers)) {
    return NextResponse.json({ error: "answers의 questionId/score(0/1/2) 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const response = await submitChecklistResponse({
    patientId: link.patientId,
    source: "SHARE_LINK",
    shareLinkId: link.id,
    otherSymptomsText: typeof body.otherSymptomsText === "string" ? body.otherSymptomsText : null,
    answers: body.answers,
  });

  return NextResponse.json(response);
}
