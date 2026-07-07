import { NextResponse } from "next/server";
import { getProgramEventDetail } from "@/lib/program-events";
import { generateTrialMessageDraft } from "@/lib/ai-message";
import { TRIAL_WELCOME_TEMPLATE } from "@/lib/message-templates";

const AI_GENERATED_TASK_TYPES = ["TRIAL_DAY2", "TRIAL_DEADLINE"] as const;

function isAiGeneratedTaskType(value: string): value is (typeof AI_GENERATED_TASK_TYPES)[number] {
  return (AI_GENERATED_TASK_TYPES as readonly string[]).includes(value);
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

  // TRIAL_WELCOME은 ProgramEventTemplate.generationType=FIXED라 AI 호출 없이 고정문구.
  if (!isAiGeneratedTaskType(task.taskType)) {
    return NextResponse.json({ patientMessage: TRIAL_WELCOME_TEMPLATE, internalAnalysis: "" });
  }

  try {
    const result = await generateTrialMessageDraft(task.taskType, {
      name: task.prescription.patient.name,
      surveyDataJson: task.prescription.surveyDataJson,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "문구 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
