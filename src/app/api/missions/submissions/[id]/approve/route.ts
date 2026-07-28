import { NextResponse } from "next/server";
import { approveMissionSubmission, MissionAlreadyProcessedError, MissionSubmissionNotFoundError } from "@/lib/missions";

// 미션 승인(task.md 2-3) — 담당 직원이면 누구나 처리 가능(원장 전용 아님, /todo 체크와 동일).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const submissionId = Number(id);
  if (!Number.isInteger(submissionId)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const staffUserId = Number(body.staffUserId);
  if (!staffUserId) {
    return NextResponse.json({ error: "현재 사용자를 확인할 수 없습니다." }, { status: 400 });
  }

  try {
    const updated = await approveMissionSubmission(submissionId, staffUserId);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof MissionAlreadyProcessedError || err instanceof MissionSubmissionNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
