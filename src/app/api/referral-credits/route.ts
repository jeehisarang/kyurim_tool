import { NextResponse } from "next/server";
import { listReferralCreditSummary } from "@/lib/referrals";

// 원장 전용 적립 현황 화면(task.md Phase 3-3, /settings/referral-credits).
export async function GET() {
  const summary = await listReferralCreditSummary();
  return NextResponse.json(summary);
}
