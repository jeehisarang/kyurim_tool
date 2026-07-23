import { NextResponse } from "next/server";
import { getTrialReferralHintForPatient } from "@/lib/referrals";

// 처방등록 "소개 확인" 힌트(task.md Phase 3-2) — 이 환자가 체험신청 당시 추천코드로
// 들어왔다면 그 코드 소유 환자를 본프로그램 추천인 후보로 제시한다.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patientId = Number(id);
  if (!Number.isInteger(patientId)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const hint = await getTrialReferralHintForPatient(patientId);
  return NextResponse.json(hint);
}
