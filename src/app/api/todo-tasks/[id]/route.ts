import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { completeTodoTask } from "@/lib/prescriptions";
import { confirmMessage, skipMessage } from "@/lib/messages";
import { confirmProgramEvent, skipProgramEvent } from "@/lib/program-events";
import { TODO_TASK_INCLUDE, normalizeTodoTask, type EventLogLite } from "@/lib/todo-tasks";
import { isMessageTaskType } from "@/lib/task-types";

const SKIPPABLE_TASK_TYPES = ["DAY7"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const doneByUserId = body.doneByUserId;
  const action = body.action === "SKIPPED" ? "SKIPPED" : "DONE";

  if (typeof doneByUserId !== "number") {
    return NextResponse.json(
      { error: "체크한 사람을 선택하세요." },
      { status: 400 },
    );
  }

  const task = await prisma.todoTask.findUniqueOrThrow({ where: { id: Number(id) } });

  let eventLog: EventLogLite = null;

  if (isMessageTaskType(task.taskType)) {
    if (action === "SKIPPED" && !SKIPPABLE_TASK_TYPES.includes(task.taskType)) {
      return NextResponse.json({ error: "7일톡만 보류할 수 있습니다." }, { status: 400 });
    }

    if (task.patientId) {
      // 자가치유형 톡(DAY2/DAY7/THIRD_VISIT): MessageLog가 진실원천
      eventLog =
        action === "SKIPPED"
          ? await skipMessage({ patientId: task.patientId, messageType: task.taskType, staffUserId: doneByUserId })
          : await confirmMessage({
              patientId: task.patientId,
              messageType: task.taskType,
              staffUserId: doneByUserId,
              aiDraftContent: typeof body.patientMessage === "string" ? body.patientMessage : undefined,
            });
    } else {
      // 프로그램 이벤트(예: 킬팻캡슐 3일체험 TRIAL_*): ProgramEventLog가 진실원천
      eventLog =
        action === "SKIPPED"
          ? await skipProgramEvent({ todoTaskId: task.id, staffUserId: doneByUserId })
          : await confirmProgramEvent({
              todoTaskId: task.id,
              staffUserId: doneByUserId,
              patientMessage: typeof body.patientMessage === "string" ? body.patientMessage : undefined,
              internalAnalysis: typeof body.internalAnalysis === "string" ? body.internalAnalysis : undefined,
            });
    }
  } else {
    if (action === "SKIPPED") {
      return NextResponse.json({ error: "처방 할일은 보류할 수 없습니다." }, { status: 400 });
    }
    await completeTodoTask(task.id, doneByUserId);
  }

  const updated = await prisma.todoTask.findUniqueOrThrow({
    where: { id: Number(id) },
    include: TODO_TASK_INCLUDE,
  });

  return NextResponse.json(normalizeTodoTask(updated, eventLog));
}
