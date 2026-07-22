import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  TODO_TASK_INCLUDE,
  normalizeTodoTask,
  hasResolvedPatient,
  findMessageLogsByPatientAndType,
  findProgramEventLogsByTodoTaskIds,
} from "@/lib/todo-tasks";
import { MESSAGE_TASK_TYPES } from "@/lib/task-types";
import { listHappyTalkCandidates } from "@/lib/happy-talk";

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

  const candidates = tasks
    .map((task) => {
      const eventLog = task.patientId
        ? (logByPatientKey.get(`${task.patientId}:${task.taskType}`) ?? null)
        : (logByTaskId.get(task.id) ?? null);
      return normalizeTodoTask(task, eventLog);
    })
    .filter(hasResolvedPatient)
    .map((normalized) => ({
      ...normalized,
      sourceLabel: normalized.program?.name ?? "내원기반",
      remainingRounds: null as number | null,
    }));

  // 해피톡(처방주기 안내, task.md) — NEXT_DOSE는 MESSAGE_TASK_TYPES에 넣지 않았으므로
  // (넣으면 "오늘 할 일" 체크 흐름이 완전히 달라짐, completeTodoTask 문서 참고) 위 쿼리와는
  // 별도로 조회해서 같은 배열에 합친다. dueDate 기준으로 함께 정렬한다.
  const happyTalkCandidates = await listHappyTalkCandidates(patientId, referenceDate);

  const merged = [...candidates, ...happyTalkCandidates].sort((a, b) => {
    const aTime = a.dueDate ? new Date(a.dueDate).getTime() : 0;
    const bTime = b.dueDate ? new Date(b.dueDate).getTime() : 0;
    return aTime - bTime;
  });

  return NextResponse.json(merged);
}
