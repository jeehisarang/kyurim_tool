import { NextResponse } from "next/server";
import { getActiveReferralLinksForPatient } from "@/lib/referrals";

// 톡생성기 "링크 포함하기 > 추천링크" 체크박스(task2.md) — 환자가 보유한 활성 추천링크 목록.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patientId = Number(id);
  if (!Number.isInteger(patientId)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const links = await getActiveReferralLinksForPatient(patientId);
  return NextResponse.json(links);
}
