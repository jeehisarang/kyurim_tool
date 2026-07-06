import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const MESSAGE_TYPES = ["WELCOME", "MEETING", "DAY2", "DAY7", "THIRD_VISIT"] as const;
const AI_MESSAGE_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"];

export async function POST(request: Request) {
  const body = await request.json();
  const { patientId, messageType, staffUserId, aiDraftContent } = body;

  if (!patientId || !MESSAGE_TYPES.includes(messageType) || !staffUserId) {
    return NextResponse.json(
      { error: "patientId, messageType, staffUserId가 필요합니다." },
      { status: 400 },
    );
  }

  const draftToStore = AI_MESSAGE_TYPES.includes(messageType)
    ? (aiDraftContent ?? null)
    : null;

  const log = await prisma.messageLog.upsert({
    where: {
      patientId_messageType: {
        patientId: Number(patientId),
        messageType,
      },
    },
    update: {
      sentDate: new Date(),
      staffUserId: Number(staffUserId),
      aiDraftContent: draftToStore,
    },
    create: {
      patientId: Number(patientId),
      messageType,
      sentDate: new Date(),
      staffUserId: Number(staffUserId),
      aiDraftContent: draftToStore,
    },
    include: { staffUser: true },
  });

  return NextResponse.json(log);
}
