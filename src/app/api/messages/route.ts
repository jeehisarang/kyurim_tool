import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const MESSAGE_TYPES = ["WELCOME", "MEETING", "DAY2", "DAY7", "THIRD_VISIT"] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const patientId = Number(searchParams.get("patientId"));

  if (!patientId) {
    return NextResponse.json({ error: "patientId가 필요합니다." }, { status: 400 });
  }

  const logs = await prisma.messageLog.findMany({
    where: { patientId },
    include: { staffUser: true, skippedByUser: true },
  });
  const byType = new Map(logs.map((log) => [log.messageType, log]));

  const result = MESSAGE_TYPES.map((messageType) => {
    const log = byType.get(messageType);
    return {
      messageType,
      sentDate: log?.sentDate ?? null,
      staffUser: log?.staffUser ?? null,
      skippedAt: log?.sentDate ? null : (log?.skippedAt ?? null),
      skippedByUser: log?.sentDate ? null : (log?.skippedByUser ?? null),
      aiDraftContent: log?.aiDraftContent ?? null,
    };
  });

  return NextResponse.json(result);
}
