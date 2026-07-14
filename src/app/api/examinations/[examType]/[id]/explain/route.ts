import { NextResponse } from "next/server";
import { ensureBodyCompositionExplanation, ensureStrengthTestExplanation } from "@/lib/examinations";

// 과거(aiExplanation=null) 검사기록을 "환자와 함께보기"에서 열람할 때 즉석 생성 + 캐싱하는
// 엔드포인트(task.md) — ensureXxxExplanation이 이미 생성돼 있으면 그대로, 없으면 새로
// 생성해 저장한 뒤 반환한다. AI 생성이 실패해도(네트워크/키 미설정 등) 예외를 던지지 않고
// null을 반환하므로 항상 200으로 응답한다 — "환자와 함께보기" 화면이 부가기능 실패로
// 에러를 띄우면 안 되기 때문(신규 저장 시 동기 생성과 동일한 원칙).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ examType: string; id: string }> },
) {
  const { examType, id } = await params;
  const recordId = Number(id);

  if (examType === "BODY_COMPOSITION") {
    const aiExplanation = await ensureBodyCompositionExplanation(recordId);
    return NextResponse.json({ aiExplanation });
  }
  if (examType === "STRENGTH_TEST") {
    const aiExplanation = await ensureStrengthTestExplanation(recordId);
    return NextResponse.json({ aiExplanation });
  }
  return NextResponse.json({ error: "알 수 없는 검사 종류입니다." }, { status: 400 });
}
