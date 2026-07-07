import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { completeTodoTask } from "@/lib/prescriptions";
import { confirmMessage } from "@/lib/messages";
import { TODO_TASK_INCLUDE, normalizeTodoTask } from "@/lib/todo-tasks";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const doneByUserId = body.doneByUserId;

  if (typeof doneByUserId !== "number") {
    return NextResponse.json(
      { error: "체크한 사람을 선택하세요." },
      { status: 400 },
    );
  }

  const task = await prisma.todoTask.findUniqueOrThrow({ where: { id: Number(id) } });

  let talkLog = null;
  if (task.prescriptionId) {
    await completeTodoTask(task.id, doneByUserId);
  } else if (task.patientId) {
    talkLog = await confirmMessage({
      patientId: task.patientId,
      messageType: task.taskType,
      staffUserId: doneByUserId,
    });
  }

  const updated = await prisma.todoTask.findUniqueOrThrow({
    where: { id: Number(id) },
    include: TODO_TASK_INCLUDE,
  });

  return NextResponse.json(normalizeTodoTask(updated, talkLog));
}
