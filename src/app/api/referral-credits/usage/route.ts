import { NextResponse } from "next/server";
import { createReferralCreditUsage, InvalidCreditUsageAmountError } from "@/lib/referral-credit-usage";

// 적립금 "사용 처리"(task.md) — /settings/referral-credits 전용, 원장 화면에서만 노출되는
// 버튼이라 인증은 클라이언트 role 체크(isDirector)에 맡긴다(다른 원장 전용 화면과 동일한
// 수준 — 예: /settings/trial-campaign도 서버단 재검증 없이 UI에서만 막음).
export async function POST(request: Request) {
  const body = await request.json();
  const patientId = Number(body.patientId);
  const amount = Number(body.amount);
  const staffUserId = Number(body.staffUserId);
  const memo = typeof body.memo === "string" ? body.memo : undefined;

  if (!patientId || !staffUserId) {
    return NextResponse.json({ error: "환자와 처리자 정보가 필요합니다." }, { status: 400 });
  }

  try {
    const usage = await createReferralCreditUsage({ patientId, amount, memo, staffUserId });
    return NextResponse.json(usage, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidCreditUsageAmountError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "사용 처리에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
