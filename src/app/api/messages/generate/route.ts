import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateMessageDraft } from "@/lib/ai-message";

const AI_MESSAGE_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"] as const;
type AiMessageType = (typeof AI_MESSAGE_TYPES)[number];

function isAiMessageType(value: unknown): value is AiMessageType {
  return AI_MESSAGE_TYPES.includes(value as AiMessageType);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { patientId, messageType } = body;

  if (!patientId || !isAiMessageType(messageType)) {
    return NextResponse.json(
      { error: "patientId와 messageType(DAY2|DAY7|THIRD_VISIT)이 필요합니다." },
      { status: 400 },
    );
  }

  const patient = await prisma.patient.findUnique({ where: { id: Number(patientId) } });
  if (!patient) {
    return NextResponse.json({ error: "환자를 찾을 수 없습니다." }, { status: 404 });
  }

  const visits = await prisma.visit.findMany({
    where: { patientId: Number(patientId) },
    include: { treatmentCategory: true, visitType: true },
    orderBy: { visitDate: "desc" },
    take: 5,
  });

  try {
    const content = await generateMessageDraft(messageType, {
      name: patient.name,
      memo: patient.memo,
      recentVisits: visits.map((v) => ({
        visitDate: v.visitDate,
        treatmentCategory: v.treatmentCategory.name,
        visitType: v.visitType.name,
      })),
    });

    return NextResponse.json({ content });
  } catch (err) {
    const message = err instanceof Error ? err.message : "문구 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
