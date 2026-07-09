import { NextResponse } from "next/server";
import { skipMessage } from "@/lib/messages";

// 2일톡/3회차톡도 수동 즉시 보류가 가능해야 한다 — 기존에는 7일톡만 가능했음
// (task2.md 확인/수정 요청).
const SKIPPABLE_MESSAGE_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"] as const;

export async function POST(request: Request) {
  const body = await request.json();
  const { patientId, messageType, staffUserId } = body;

  if (!patientId || !SKIPPABLE_MESSAGE_TYPES.includes(messageType) || !staffUserId) {
    return NextResponse.json(
      { error: "patientId, messageType(DAY2/DAY7/THIRD_VISIT), staffUserId가 필요합니다." },
      { status: 400 },
    );
  }

  const log = await skipMessage({
    patientId: Number(patientId),
    messageType,
    staffUserId: Number(staffUserId),
  });

  return NextResponse.json(log);
}
