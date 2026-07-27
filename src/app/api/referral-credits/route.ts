import { NextResponse } from "next/server";
import { listReferralCreditSummary } from "@/lib/referrals";
import { listAllPatientUsageTotals } from "@/lib/referral-credit-usage";

// 원장 전용 적립 현황 화면(task.md Phase 3-3, /settings/referral-credits).
// 잔액 현황(task.md 신규) — totalUsed/balance를 여기서 합쳐서 내려준다(화면은 이 응답
// 하나만 보고 렌더링, 별도 API 호출 없음).
export async function GET() {
  const [summary, usageTotals] = await Promise.all([listReferralCreditSummary(), listAllPatientUsageTotals()]);
  const withBalance = summary.map((p) => {
    const totalUsed = usageTotals.get(p.patientId) ?? 0;
    return { ...p, totalUsed, balance: p.confirmedTotal - totalUsed };
  });
  return NextResponse.json(withBalance);
}
