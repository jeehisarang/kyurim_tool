import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateTalkTodos } from "@/lib/talk-todos";
import {
  TODO_TASK_INCLUDE,
  normalizeTodoTask,
  findMessageLogsByPatientAndType,
} from "@/lib/todo-tasks";

const TALK_TASK_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"] as const;

function endOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

export async function GET(request: Request) {
  await generateTalkTodos();

  const { searchParams } = new URL(request.url);
  const staffUserId = searchParams.get("staffUserId");

  const tasks = await prisma.todoTask.findMany({
    where: {
      dueDate: { lt: endOfToday() },
      ...(staffUserId ? { staffUserId: Number(staffUserId) } : {}),
    },
    include: TODO_TASK_INCLUDE,
    orderBy: { dueDate: "asc" },
  });

  const talkPatientIds = tasks
    .filter((t): t is typeof t & { patientId: number } => t.patientId !== null)
    .map((t) => t.patientId);
  const logByKey = await findMessageLogsByPatientAndType(talkPatientIds, TALK_TASK_TYPES);

  const normalized = tasks.map((task) =>
    normalizeTodoTask(task, logByKey.get(`${task.patientId}:${task.taskType}`) ?? null),
  );

  return NextResponse.json(normalized);
}
