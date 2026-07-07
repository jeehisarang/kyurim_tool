import { NextResponse } from "next/server";
import { skipMessage } from "@/lib/messages";

const SKIPPABLE_MESSAGE_TYPES = ["DAY7"] as const;

export async function POST(request: Request) {
  const body = await request.json();
  const { patientId, messageType, staffUserId } = body;

  if (!patientId || !SKIPPABLE_MESSAGE_TYPES.includes(messageType) || !staffUserId) {
    return NextResponse.json(
      { error: "patientId, messageType(DAY7), staffUserId가 필요합니다." },
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
