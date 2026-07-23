import { NextResponse } from "next/server";
import { getTrialApplicationById } from "@/lib/referrals";

// 직원용 단건 조회(/prescriptions/new 프리필) — /refer/applications 없이 피커 모달에서
// 목록 클릭 시 이 값을 그대로 씀(별도 fetch 없이 목록 응답을 재사용해도 되지만, 상세
// 재조회 경로도 열어둔다).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const application = await getTrialApplicationById(Number(id));
  if (!application) {
    return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(application);
}
