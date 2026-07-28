import { NextResponse } from "next/server";
import { requestShareLinkConsultCallback } from "@/lib/share-links";

// 인증 없는 공개 엔드포인트(/s/{token} 하단 고정 CTA "진료상담문의하기" 전용, task3.md) —
// 기존 event-consult-request/exam-consult-request 2개 라우트를 이 하나로 통합했다.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await requestShareLinkConsultCallback(token);
  if (!result) {
    return NextResponse.json({ error: "공유링크를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
