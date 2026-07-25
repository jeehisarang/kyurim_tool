import { NextResponse } from "next/server";
import { confirmReferralCreditEntry } from "@/lib/referrals";
import { isDirector } from "@/lib/staff-auth";

// "결제 완료 확인"(task.md 추천 이벤트 개선 4-2) — MAIN_SIGNUP PENDING 적립을 CONFIRMED로
// 전환한다. /settings/referral-credits와 동일하게 원장 전용(POST /api/trial-campaign과
// 동일한 staffUserId+isDirector 패턴).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const staffUserId = Number(body.staffUserId);
  if (!staffUserId || !(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 확정 처리할 수 있습니다." }, { status: 403 });
  }

  const updated = await confirmReferralCreditEntry(entryId, staffUserId);
  if (!updated) {
    return NextResponse.json({ error: "이미 확정됐거나 존재하지 않는 내역입니다." }, { status: 404 });
  }
  return NextResponse.json(updated);
}
