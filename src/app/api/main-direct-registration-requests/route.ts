import { NextResponse } from "next/server";
import { listMainDirectRegistrationRequests } from "@/lib/referrals";

// 직원용 목록 — MAIN 등급 "바로 등록하기" 신청 전체보기(task.md).
export async function GET() {
  const requests = await listMainDirectRegistrationRequests();
  return NextResponse.json(requests);
}
