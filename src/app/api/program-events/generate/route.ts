import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProgramEventDetail } from "@/lib/program-events";
import { generateTrialMessageDraft, generateHappyTalkMessageDraft } from "@/lib/ai-message";
import { listConsultationNotesForPatient } from "@/lib/consultation-notes";
import { HAPPY_TALK_TASK_TYPE } from "@/lib/happy-talk";

const SHARE_BASE_URL = process.env.NEXT_PUBLIC_SHARE_BASE_URL || "https://link.kyurim.kr";

// 3종(웰컴/2일차/마감) 전부 AI 생성으로 통일 — 웰컴톡도 설문 데이터를 반영해야 하므로
// 더 이상 고정 템플릿을 쓰지 않는다 (task.md 지시).
const TRIAL_TASK_TYPES = ["TRIAL_WELCOME", "TRIAL_DAY2", "TRIAL_DEADLINE"] as const;

function isTrialTaskType(value: string): value is (typeof TRIAL_TASK_TYPES)[number] {
  return (TRIAL_TASK_TYPES as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { todoTaskId, extraKeywords } = body;

  if (!todoTaskId) {
    return NextResponse.json({ error: "todoTaskId가 필요합니다." }, { status: 400 });
  }

  const { task } = await getProgramEventDetail(Number(todoTaskId));
  if (!task.prescription) {
    return NextResponse.json({ error: "프로그램 이벤트가 아닙니다." }, { status: 400 });
  }

  // 해피톡(처방주기 안내, task.md/13-5) — SPLIT 처방의 "다음 처방일"(NEXT_DOSE) 리마인더.
  // TRIAL_*(FIXED_SEQUENCE)과 입력재료/프롬프트가 완전히 달라 별도 함수로 분기한다.
  if (task.taskType === HAPPY_TALK_TASK_TYPE) {
    const { prescription } = task;
    if (!task.dueDate) {
      return NextResponse.json({ error: "다음 처방일 정보가 없습니다." }, { status: 400 });
    }
    const remainingRounds =
      prescription.totalRounds != null && prescription.currentRound != null
        ? prescription.totalRounds - prescription.currentRound + 1
        : null;

    const [notes, consultationNotes] = await Promise.all([
      prisma.patientNote.findMany({ where: { patientId: prescription.patient.id }, orderBy: { createdAt: "desc" } }),
      listConsultationNotesForPatient(prescription.patient.id),
    ]);
    const latestNote = consultationNotes[0];
    const latestConsultationNote = latestNote
      ? { typeName: latestNote.consultationType.name, text: latestNote.convertedChartText ?? latestNote.rawText }
      : undefined;

    try {
      const message = await generateHappyTalkMessageDraft({
        name: prescription.patient.name,
        memo: prescription.patient.memo,
        programName: prescription.program.name,
        remainingRounds,
        nextDueDate: task.dueDate,
        notes: notes.map((n) => ({ content: n.content, createdAt: n.createdAt })),
        coreProfile: {
          pastHistory: prescription.patient.pastHistory,
          currentCondition: prescription.patient.currentCondition,
          mainNeeds: prescription.patient.mainNeeds,
        },
        latestConsultationNote,
        extraKeywords: typeof extraKeywords === "string" && extraKeywords.trim() ? extraKeywords.trim() : undefined,
      });
      return NextResponse.json({ patientMessage: message, internalAnalysis: "" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "문구 생성에 실패했습니다.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (!isTrialTaskType(task.taskType)) {
    return NextResponse.json({ error: "지원하지 않는 프로그램 이벤트 타입입니다." }, { status: 400 });
  }

  const notes = await prisma.patientNote.findMany({
    where: { patientId: task.prescription.patient.id },
    orderBy: { createdAt: "desc" },
  });

  try {
    const exitSurveyUrl =
      task.taskType === "TRIAL_DEADLINE" ? `${SHARE_BASE_URL}/refer/exit/${task.prescription.id}` : undefined;

    const result = await generateTrialMessageDraft(
      task.taskType,
      {
        name: task.prescription.patient.name,
        memo: task.prescription.patient.memo,
        notes: notes.map((n) => ({ content: n.content, createdAt: n.createdAt })),
        surveyDataJson: task.prescription.surveyDataJson,
        coreProfile: {
          pastHistory: task.prescription.patient.pastHistory,
          currentCondition: task.prescription.patient.currentCondition,
          mainNeeds: task.prescription.patient.mainNeeds,
        },
      },
      exitSurveyUrl,
    );

    // 2일차톡 하단 추천링크 자동삽입(task.md Phase 2-2)은 톡생성기 "링크 포함하기 >
    // 추천링크" 체크박스로 대체됐다(task2.md) — 2일차톡 생성 시 그 체크박스가 기본으로
    // 켜지므로 여기서 다시 덧붙이면 중복된다.

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "문구 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
