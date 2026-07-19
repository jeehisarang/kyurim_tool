import { NextResponse } from "next/server";
import { requestExamConsultCallback } from "@/lib/share-links";

// 인증 없는 공개 엔드포인트(/s/{token} "상담예약하기" 버튼 전용, task.md PART C).
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await requestExamConsultCallback(token);
  if (!result) {
    return NextResponse.json({ error: "검사기록이 포함된 공유링크를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
