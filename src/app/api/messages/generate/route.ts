import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateMessageDraft, type ProgressLevel } from "@/lib/ai-message";
import { listConsultationNotesForPatient } from "@/lib/consultation-notes";

const AI_MESSAGE_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"] as const;
type AiMessageType = (typeof AI_MESSAGE_TYPES)[number];

const PROGRESS_LEVELS = ["HIGH", "MID", "LOW"] as const;

function isAiMessageType(value: unknown): value is AiMessageType {
  return AI_MESSAGE_TYPES.includes(value as AiMessageType);
}

function isProgressLevel(value: unknown): value is ProgressLevel {
  return PROGRESS_LEVELS.includes(value as ProgressLevel);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { patientId, messageType, extraKeywords, progressLevel } = body;

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

  const [visits, notes, consultationNotes] = await Promise.all([
    prisma.visit.findMany({
      where: { patientId: Number(patientId), isActive: true },
      include: { treatmentCategory: true, visitType: true },
      orderBy: { visitDate: "desc" },
      take: 5,
    }),
    prisma.patientNote.findMany({
      where: { patientId: Number(patientId) },
      orderBy: { createdAt: "desc" },
    }),
    listConsultationNotesForPatient(Number(patientId)),
  ]);

  // SOAP 변환본(convertedChartText)이 있으면 그쪽이 더 정리된 형태라 우선 사용, 없으면 원문
  // (program-teaching 프롬프트와 동일한 방식).
  const latestNote = consultationNotes[0];
  const latestConsultationNote = latestNote
    ? {
        typeName: latestNote.consultationType.name,
        text: latestNote.convertedChartText ?? latestNote.rawText,
      }
    : undefined;

  try {
    const content = await generateMessageDraft(messageType, {
      name: patient.name,
      memo: patient.memo,
      recentVisits: visits.map((v) => ({
        visitDate: v.visitDate,
        treatmentCategory: v.treatmentCategory.name,
        visitType: v.visitType.name,
      })),
      notes: notes.map((n) => ({ content: n.content, createdAt: n.createdAt })),
      coreProfile: {
        pastHistory: patient.pastHistory,
        currentCondition: patient.currentCondition,
        mainNeeds: patient.mainNeeds,
      },
      latestConsultationNote,
      extraKeywords: typeof extraKeywords === "string" ? extraKeywords : undefined,
      progressLevel:
        messageType === "THIRD_VISIT" && isProgressLevel(progressLevel) ? progressLevel : undefined,
    });

    return NextResponse.json({ content });
  } catch (err) {
    const message = err instanceof Error ? err.message : "문구 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
