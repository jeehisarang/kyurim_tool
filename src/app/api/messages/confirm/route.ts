import { NextResponse } from "next/server";
import { confirmMessage } from "@/lib/messages";

const MESSAGE_TYPES = ["WELCOME", "MEETING", "DAY2", "DAY7", "THIRD_VISIT"] as const;

export async function POST(request: Request) {
  const body = await request.json();
  const { patientId, messageType, staffUserId, aiDraftContent } = body;

  if (!patientId || !MESSAGE_TYPES.includes(messageType) || !staffUserId) {
    return NextResponse.json(
      { error: "patientId, messageType, staffUserId가 필요합니다." },
      { status: 400 },
    );
  }

  const log = await confirmMessage({
    patientId: Number(patientId),
    messageType,
    staffUserId: Number(staffUserId),
    aiDraftContent,
  });

  return NextResponse.json(log);
}
