import { NextResponse } from "next/server";
import { getPublicTeachingPageByToken } from "@/lib/teaching-pages";

// 인증 없는 공개 엔드포인트(/p/{token} 전용) — getPublicTeachingPageByToken 자체가
// 화이트리스트 변환이라 내부 필드가 새어나갈 수 없다.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getPublicTeachingPageByToken(token);
  if (!view) {
    return NextResponse.json({ error: "티칭지를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(view);
}
