import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { completeTodoTask } from "@/lib/prescriptions";
import { confirmMessage, skipMessage } from "@/lib/messages";
import { TODO_TASK_INCLUDE, normalizeTodoTask } from "@/lib/todo-tasks";

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

  let talkLog = null;
  if (task.prescriptionId) {
    if (action === "SKIPPED") {
      return NextResponse.json({ error: "처방 할일은 보류할 수 없습니다." }, { status: 400 });
    }
    await completeTodoTask(task.id, doneByUserId);
  } else if (task.patientId) {
    if (action === "SKIPPED" && !SKIPPABLE_TASK_TYPES.includes(task.taskType)) {
      return NextResponse.json({ error: "7일톡만 보류할 수 있습니다." }, { status: 400 });
    }
    talkLog =
      action === "SKIPPED"
        ? await skipMessage({ patientId: task.patientId, messageType: task.taskType, staffUserId: doneByUserId })
        : await confirmMessage({ patientId: task.patientId, messageType: task.taskType, staffUserId: doneByUserId });
  }

  const updated = await prisma.todoTask.findUniqueOrThrow({
    where: { id: Number(id) },
    include: TODO_TASK_INCLUDE,
  });

  return NextResponse.json(normalizeTodoTask(updated, talkLog));
}
