import { NextResponse } from "next/server";
import { ignoreHrvImportPending } from "@/lib/hrv-csv-import";

// 미매칭 대기열 항목을 "무시"로만 표시(검사기록 전환 없이 목록에서 정리, task.md).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const staffUserId = Number(body.staffUserId);

  if (!staffUserId) {
    return NextResponse.json({ error: "담당자를 확인해주세요." }, { status: 400 });
  }

  await ignoreHrvImportPending(Number(id), staffUserId);
  return NextResponse.json({ success: true });
}
