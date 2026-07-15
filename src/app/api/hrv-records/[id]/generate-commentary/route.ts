import { NextResponse } from "next/server";
import { ensureHrvExplanation } from "@/lib/hrv";

// 과거(aiCommentary=null) 검사기록을 "환자와 함께보기"에서 열람할 때 즉석 생성 + 캐싱하는
// 엔드포인트(examinations/[examType]/[id]/explain과 동일 원칙) — 실패해도 null을 반환하므로
// 항상 200으로 응답한다(부가기능 실패로 화면이 에러를 띄우면 안 됨).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const aiCommentary = await ensureHrvExplanation(Number(id));
  return NextResponse.json({ aiCommentary });
}
