import { NextResponse } from "next/server";
import { requestMainDirectRegistrationCallback } from "@/lib/referrals";

// MAIN 등급 랜딩페이지 "바로 등록하고 할인받기"(task.md 추천 이벤트 개선 3) 제출 — 인증 없음.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!name || !phone) {
    return NextResponse.json({ error: "이름과 연락처를 입력해주세요." }, { status: 400 });
  }

  const result = await requestMainDirectRegistrationCallback({ name, phone, referrerToken: token });
  if (!result) {
    return NextResponse.json({ error: "유효하지 않은 링크입니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
