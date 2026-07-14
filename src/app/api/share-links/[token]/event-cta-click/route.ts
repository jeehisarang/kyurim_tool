import { NextResponse } from "next/server";
import { recordEventCtaClick } from "@/lib/event-images";

// 인증 없는 공개 엔드포인트(/s/{token} "이벤트문의하기" 버튼 전용) — recordEventCtaClick
// 자체가 PATIENT 활동피드 기록까지 처리한다.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await recordEventCtaClick(token);
  if (!ok) {
    return NextResponse.json({ error: "이벤트 공유링크를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
