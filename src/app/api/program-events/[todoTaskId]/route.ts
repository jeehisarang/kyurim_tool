import { NextResponse } from "next/server";
import { getProgramEventDetail } from "@/lib/program-events";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ todoTaskId: string }> },
) {
  const { todoTaskId } = await params;
  const { task, log } = await getProgramEventDetail(Number(todoTaskId));

  if (!task.prescription) {
    return NextResponse.json({ error: "프로그램 이벤트가 아닙니다." }, { status: 400 });
  }

  return NextResponse.json({
    todoTaskId: task.id,
    taskType: task.taskType,
    dueDate: task.dueDate,
    patient: task.prescription.patient,
    program: task.prescription.program,
    surveyDataJson: task.prescription.surveyDataJson,
    sentDate: log?.sentDate ?? null,
    staffUser: log?.staffUser ?? null,
    skippedAt: log?.skippedAt ?? null,
    skippedByUser: log?.skippedByUser ?? null,
    patientMessage: log?.patientMessage ?? null,
    internalAnalysis: log?.internalAnalysis ?? null,
  });
}
