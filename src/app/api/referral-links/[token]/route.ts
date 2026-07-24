import { NextResponse } from "next/server";
import { getReferralLinkStatusByToken } from "@/lib/referrals";

// "내 추천 현황" 공개페이지(/refer/my/[token], task.md) — 인증 없음.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const status = await getReferralLinkStatusByToken(token);
  if (!status) {
    return NextResponse.json({ error: "추천 링크를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(status);
}
