import { NextResponse } from "next/server";
import { rejectMissionSubmission, MissionAlreadyProcessedError, MissionSubmissionNotFoundError } from "@/lib/missions";

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
    const updated = await rejectMissionSubmission(submissionId, staffUserId);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof MissionAlreadyProcessedError || err instanceof MissionSubmissionNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
