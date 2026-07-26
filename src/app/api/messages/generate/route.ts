import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateMessageDraft, generateFreeformMessageDraft, parseIncludedLinks, type ProgressLevel } from "@/lib/ai-message";
import { listConsultationNotesForPatient } from "@/lib/consultation-notes";

const AI_MESSAGE_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"] as const;
type AiMessageType = (typeof AI_MESSAGE_TYPES)[number];
// 자유톡(범용 AI 문자생성, task.md) — 기존 3종과 달리 발송이력 추적(MessageLog) 대상이
// 아니라 이 생성 API에만 새 타입으로 추가한다(statuses 배열/MESSAGE_TYPE_LABEL 등은 건드리지 않음).
const FREEFORM_MESSAGE_TYPE = "FREEFORM";

const PROGRESS_LEVELS = ["HIGH", "MID", "LOW"] as const;

function isAiMessageType(value: unknown): value is AiMessageType {
  return AI_MESSAGE_TYPES.includes(value as AiMessageType);
}

function isProgressLevel(value: unknown): value is ProgressLevel {
  return PROGRESS_LEVELS.includes(value as ProgressLevel);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { patientId, messageType, extraKeywords, progressLevel, instruction, includedLinks } = body;

  const isFreeform = messageType === FREEFORM_MESSAGE_TYPE;
  if (!patientId || (!isAiMessageType(messageType) && !isFreeform)) {
    return NextResponse.json(
      { error: "patientId와 messageType(DAY2|DAY7|THIRD_VISIT|FREEFORM)이 필요합니다." },
      { status: 400 },
    );
  }
  if (isFreeform && (typeof instruction !== "string" || !instruction.trim())) {
    return NextResponse.json({ error: "생성하고 싶은 메시지의 목적/내용을 입력해주세요." }, { status: 400 });
  }

  const patient = await prisma.patient.findUnique({ where: { id: Number(patientId) } });
  if (!patient) {
    return NextResponse.json({ error: "환자를 찾을 수 없습니다." }, { status: 404 });
  }

  const [visits, notes, consultationNotes, activePrescriptions] = await Promise.all([
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
    // 자유톡 전용(task.md 원칙 — 정확성이 필요한 진행 프로그램/회차 정보는 AI가 추측하지
    // 않고 코드가 채워 넣는다). 다른 메시지 타입은 이 정보를 안 쓰므로 쿼리 자체를
    // isFreeform일 때만 실행한다.
    isFreeform
      ? prisma.prescription.findMany({
          where: { patientId: Number(patientId), status: "ACTIVE" },
          include: { program: true },
        })
      : Promise.resolve([]),
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

  const basePatientContext = {
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
    // "링크 포함하기"(프로그램티칭/이벤트/검사결과/추천링크)에서 생성된 링크(task.md 재구조화) —
    // 클라이언트가 보낸 값을 그대로 믿지 않고 형태를 검증한다.
    includedLinks: parseIncludedLinks(includedLinks),
  };

  try {
    if (isFreeform) {
      const activeProgramSummary =
        activePrescriptions.length > 0
          ? activePrescriptions
              .map((p) => {
                const roundPart =
                  p.currentRound != null && p.totalRounds != null ? ` (${p.currentRound}/${p.totalRounds}회차)` : "";
                return `${p.program.name}${roundPart}`;
              })
              .join(", ")
          : null;

      const content = await generateFreeformMessageDraft(
        { ...basePatientContext, activeProgramSummary },
        instruction.trim(),
      );
      return NextResponse.json({ content });
    }

    const content = await generateMessageDraft(messageType, {
      ...basePatientContext,
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
