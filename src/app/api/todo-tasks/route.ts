import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateTalkTodos } from "@/lib/talk-todos";
import {
  TODO_TASK_INCLUDE,
  normalizeTodoTask,
  findMessageLogsByPatientAndType,
  findProgramEventLogsByTodoTaskIds,
} from "@/lib/todo-tasks";
import { isMessageTaskType } from "@/lib/task-types";

// MessageLog는 patientId 직결 자가치유형 톡(2일/7일/3회차톡)만 저장한다.
// 프로그램 이벤트(TRIAL_* 등, prescriptionId 경유)는 ProgramEventLog를 따로 조회한다.
const TALK_MESSAGE_LOG_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"] as const;

/** "YYYY-MM-DD" 쿼리 파라미터를 로컬 자정 기준 Date로 파싱. 없거나 형식이 잘못되면 오늘. */
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

export async function GET(request: Request) {
  await generateTalkTodos();

  const { searchParams } = new URL(request.url);
  const staffUserId = searchParams.get("staffUserId");
  const referenceDate = startOfDay(parseDateParam(searchParams.get("date")));

  const tasks = await prisma.todoTask.findMany({
    where: {
      dueDate: { lt: endOfDay(referenceDate) },
      ...(staffUserId ? { staffUserId: Number(staffUserId) } : {}),
    },
    include: TODO_TASK_INCLUDE,
    orderBy: { dueDate: "asc" },
  });

  const talkPatientIds = tasks
    .filter((t): t is typeof t & { patientId: number } => t.patientId !== null)
    .map((t) => t.patientId);
  const logByPatientKey = await findMessageLogsByPatientAndType(talkPatientIds, TALK_MESSAGE_LOG_TYPES);

  const programEventTaskIds = tasks
    .filter((t) => t.patientId === null && isMessageTaskType(t.taskType))
    .map((t) => t.id);
  const logByTaskId = await findProgramEventLogsByTodoTaskIds(programEventTaskIds);

  const normalized = tasks.map((task) => {
    const eventLog = task.patientId
      ? (logByPatientKey.get(`${task.patientId}:${task.taskType}`) ?? null)
      : (logByTaskId.get(task.id) ?? null);
    return normalizeTodoTask(task, eventLog);
  });

  return NextResponse.json(normalized);
}
