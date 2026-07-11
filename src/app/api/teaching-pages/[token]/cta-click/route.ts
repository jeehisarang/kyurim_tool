import { NextResponse } from "next/server";
import { recordTeachingPageCtaClick } from "@/lib/teaching-pages";

// 인증 없는 공개 엔드포인트(/p/{token} 전환버튼 전용) — recordTeachingPageCtaClick 자체가
// PATIENT 활동피드 기록까지 처리한다.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await recordTeachingPageCtaClick(token);
  if (!ok) {
    return NextResponse.json({ error: "티칭지를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
