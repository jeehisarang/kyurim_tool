import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProgramEventDetail } from "@/lib/program-events";
import { generateTrialMessageDraft } from "@/lib/ai-message";

// 3종(웰컴/2일차/마감) 전부 AI 생성으로 통일 — 웰컴톡도 설문 데이터를 반영해야 하므로
// 더 이상 고정 템플릿을 쓰지 않는다 (task.md 지시).
const TRIAL_TASK_TYPES = ["TRIAL_WELCOME", "TRIAL_DAY2", "TRIAL_DEADLINE"] as const;

function isTrialTaskType(value: string): value is (typeof TRIAL_TASK_TYPES)[number] {
  return (TRIAL_TASK_TYPES as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { todoTaskId } = body;

  if (!todoTaskId) {
    return NextResponse.json({ error: "todoTaskId가 필요합니다." }, { status: 400 });
  }

  const { task } = await getProgramEventDetail(Number(todoTaskId));
  if (!task.prescription) {
    return NextResponse.json({ error: "프로그램 이벤트가 아닙니다." }, { status: 400 });
  }
  if (!isTrialTaskType(task.taskType)) {
    return NextResponse.json({ error: "지원하지 않는 프로그램 이벤트 타입입니다." }, { status: 400 });
  }

  const notes = await prisma.patientNote.findMany({
    where: { patientId: task.prescription.patient.id },
    orderBy: { createdAt: "desc" },
  });

  try {
    const result = await generateTrialMessageDraft(task.taskType, {
      name: task.prescription.patient.name,
      memo: task.prescription.patient.memo,
      notes: notes.map((n) => ({ content: n.content, createdAt: n.createdAt })),
      surveyDataJson: task.prescription.surveyDataJson,
      coreProfile: {
        pastHistory: task.prescription.patient.pastHistory,
        currentCondition: task.prescription.patient.currentCondition,
        mainNeeds: task.prescription.patient.mainNeeds,
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "문구 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
