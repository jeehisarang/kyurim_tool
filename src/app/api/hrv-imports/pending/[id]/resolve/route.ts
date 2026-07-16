import { NextResponse } from "next/server";
import { resolveHrvImportPending } from "@/lib/hrv-csv-import";

// 미매칭 대기열 항목에 직원이 환자를 지정해 정식 HrvTestRecord로 전환한다(task.md).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const patientId = Number(body.patientId);
  const staffUserId = Number(body.staffUserId);

  if (!patientId || !staffUserId) {
    return NextResponse.json({ error: "환자와 담당자를 확인해주세요." }, { status: 400 });
  }

  try {
    const result = await resolveHrvImportPending(Number(id), patientId, staffUserId);
    if (!result) {
      return NextResponse.json({ error: "대기열 항목을 찾을 수 없거나 이미 처리되었습니다." }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "검사기록 전환에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
