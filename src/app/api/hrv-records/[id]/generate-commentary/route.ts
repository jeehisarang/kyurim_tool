import { NextResponse } from "next/server";
import { ensureHrvExplanation, regenerateHrvExplanation } from "@/lib/hrv";

// 과거(섹션 필드=null) 검사기록을 "환자와 함께보기"/원장 확인 화면에서 열람할 때 즉석 생성 +
// 캐싱하는 엔드포인트(examinations/[examType]/[id]/explain과 동일 원칙) — 실패해도 null을
// 반환하므로 항상 200으로 응답한다(부가기능 실패로 화면이 에러를 띄우면 안 됨).
// body에 { force: true }가 오면(원장 확인 화면의 "AI 코멘트 재생성" 버튼) 기존 캐시를
// 무시하고 최신 학술근거/매핑표로 무조건 새로 생성한다 — patient-view는 body 없이
// fire-and-forget으로 호출하므로 JSON 파싱 실패를 정상 케이스로 처리한다(task.md).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let force = false;
  try {
    const body = await request.json();
    force = body?.force === true;
  } catch {
    // 본문 없이 호출된 경우(환자와 함께보기의 캐시 채우기 요청) — force=false 유지.
  }
  const sections = force
    ? await regenerateHrvExplanation(Number(id))
    : await ensureHrvExplanation(Number(id));
  return NextResponse.json({ sections });
}
