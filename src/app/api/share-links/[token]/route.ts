import { NextResponse } from "next/server";
import { getShareLinkByToken } from "@/lib/share-links";

// 인증 없는 공개 엔드포인트(/s/{token} 전용) — getShareLinkByToken이 이미 화이트리스트
// 변환을 마친 안전한 필드만 내려준다(teaching-pages.ts getPublicTeachingPageByToken과 동일 원칙).
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getShareLinkByToken(token);
  if (!view) {
    return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(view);
}
