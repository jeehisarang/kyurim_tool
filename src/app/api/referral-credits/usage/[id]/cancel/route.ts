import { NextResponse } from "next/server";
import {
  cancelReferralCreditUsage,
  ReferralCreditUsageNotFoundError,
  ReferralCreditUsageAlreadyCancelledError,
} from "@/lib/referral-credit-usage";

// 적립금 사용내역 취소(소프트 삭제, task.md) — 취소 즉시 그 금액만큼 잔액이 복구된다
// (getPatientCreditBalance가 isCancelled=false만 합산).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usageId = Number(id);
  if (!Number.isInteger(usageId)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const staffUserId = Number(body.staffUserId);
  if (!staffUserId) {
    return NextResponse.json({ error: "처리자 정보가 필요합니다." }, { status: 400 });
  }

  try {
    const updated = await cancelReferralCreditUsage(usageId, staffUserId);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof ReferralCreditUsageNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof ReferralCreditUsageAlreadyCancelledError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
