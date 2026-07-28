import { NextResponse } from "next/server";
import {
  editReferralCreditUsage,
  InvalidCreditUsageAmountError,
  ReferralCreditUsageNotFoundError,
  ReferralCreditUsageAlreadyCancelledError,
} from "@/lib/referral-credit-usage";

// 적립금 사용내역 수정(task.md) — /settings/referral-credits 전용, 기존 "사용 처리"
// 버튼과 동일한 권한 수준(원장 전용 화면 UI 노출만으로 제한, 서버단 재검증 없음 —
// /api/referral-credits/usage/route.ts와 동일한 기존 관례).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usageId = Number(id);
  if (!Number.isInteger(usageId)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const staffUserId = Number(body.staffUserId);
  const usedAt = body.usedAt ? new Date(body.usedAt) : null;

  if (!staffUserId || !usedAt || Number.isNaN(usedAt.getTime())) {
    return NextResponse.json({ error: "필수 항목이 누락되었습니다." }, { status: 400 });
  }

  try {
    const updated = await editReferralCreditUsage({ usageId, amount, usedAt, staffUserId });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof InvalidCreditUsageAmountError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof ReferralCreditUsageNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof ReferralCreditUsageAlreadyCancelledError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
