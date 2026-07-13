import { NextResponse } from "next/server";
import { requestConsultCallback } from "@/lib/teaching-pages";

// 인증 없는 공개 엔드포인트(/p/{token} "본상담 예약하기" 버튼 전용) — 콜백 업무(WORK)를
// 전체공통으로 자동 생성한다(당일 중복 방지는 requestConsultCallback 내부에서 처리).
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await requestConsultCallback(token);
  if (!result) {
    return NextResponse.json({ error: "티칭지를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
