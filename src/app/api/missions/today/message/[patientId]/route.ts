import { NextResponse } from "next/server";
import { getOrCreateMissionMessageForPatient, MissionNotAssignedTodayError } from "@/lib/missions";

// 환자별 발송문구 생성(task2.md) — 서두문구+미션요약+제출링크를 조합해 반환한다. 호출 자체가
// MissionSubmission을 생성(없으면)하므로 GET이지만 부수효과가 있다 — 문구 생성/재조회가
// 곧 "발송 준비 완료" 처리라는 요구사항에 따른 설계(같은 환자 재호출 시 토큰은 그대로).
export async function GET(_request: Request, { params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const id = Number(patientId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const result = await getOrCreateMissionMessageForPatient(new Date(), id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MissionNotAssignedTodayError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
