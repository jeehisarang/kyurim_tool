import { NextResponse } from "next/server";
import {
  checkActivityLog,
  ActivityLogNotFoundError,
  ActivityLogNotPatientError,
  ActivityLogAlreadyCheckedError,
} from "@/lib/activity-log";

// PATIENT 활동 항목 "확인" 체크 — 서버단 원자적 업데이트로 동시 클릭 시 최초 1명만
// 성공한다(checkActivityLog 참고). 실패 시 프론트가 최신 상태로 다시 불러올 수 있도록
// 409에 현재 체크한 사람 이름을 함께 내려준다.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activityLogId = Number(id);
  const body = await request.json().catch(() => ({}));
  const staffId = Number(body.staffId);

  if (!activityLogId || !staffId) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    await checkActivityLog(activityLogId, staffId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ActivityLogAlreadyCheckedError) {
      return NextResponse.json(
        { error: err.message, checkedByStaffName: err.checkedByStaffName },
        { status: 409 },
      );
    }
    if (err instanceof ActivityLogNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof ActivityLogNotPatientError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "처리에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
