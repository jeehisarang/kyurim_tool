import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  TODO_TASK_INCLUDE,
  normalizeTodoTask,
  findMessageLogsByPatientAndType,
  findProgramEventLogsByTodoTaskIds,
} from "@/lib/todo-tasks";
import { MESSAGE_TASK_TYPES } from "@/lib/task-types";

const TALK_MESSAGE_LOG_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"] as const;

function parseDateParam(value: string | null): Date {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return new Date();
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

/**
 * /todo의 "톡 관리" 진입점. 내원기반(patientId 직결)/프로그램기반(prescriptionId 경유)
 * 톡 후보를 우선순위 계산 없이 한 환자 기준으로 전부 모아 반환한다.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const patientId = Number(searchParams.get("patientId"));
  if (!patientId) {
    return NextResponse.json({ error: "patientId가 필요합니다." }, { status: 400 });
  }
  const referenceDate = startOfDay(parseDateParam(searchParams.get("date")));

  const tasks = await prisma.todoTask.findMany({
    where: {
      dueDate: { lt: endOfDay(referenceDate) },
      taskType: { in: [...MESSAGE_TASK_TYPES] },
      OR: [{ patientId }, { prescription: { patientId } }],
    },
    include: TODO_TASK_INCLUDE,
    orderBy: { dueDate: "asc" },
  });

  const logByPatientKey = await findMessageLogsByPatientAndType([patientId], TALK_MESSAGE_LOG_TYPES);

  const programEventTaskIds = tasks.filter((t) => t.patientId === null).map((t) => t.id);
  const logByTaskId = await findProgramEventLogsByTodoTaskIds(programEventTaskIds);

  const candidates = tasks.map((task) => {
    const eventLog = task.patientId
      ? (logByPatientKey.get(`${task.patientId}:${task.taskType}`) ?? null)
      : (logByTaskId.get(task.id) ?? null);
    const normalized = normalizeTodoTask(task, eventLog);
    return {
      ...normalized,
      sourceLabel: normalized.program?.name ?? "내원기반",
    };
  });

  return NextResponse.json(candidates);
}
