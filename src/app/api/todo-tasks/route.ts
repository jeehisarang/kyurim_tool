import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateTalkTodos } from "@/lib/talk-todos";
import {
  TODO_TASK_INCLUDE,
  normalizeTodoTask,
  hasResolvedPatient,
  findMessageLogsByPatientAndType,
  findProgramEventLogsByTodoTaskIds,
} from "@/lib/todo-tasks";
import { isMessageTaskType, WORK_TASK_TYPE, EXAM_REMINDER_TASK_TYPE } from "@/lib/task-types";

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

  // WORK(업무/요청)는 톡/처방과 달리 "마감일 도달 시점"이 아니라 "등록 시점"부터 노출돼야
  // 하고, 완료해도 마감일 도달 여부와 무관하게 계속 노출돼야 한다(완료 즉시 그 자리에서
  // "완료(담당자명)"로 보여야 함 — 조기 완료 시 사라지는 건 버그로 확인됨). 완료된 항목을
  // 화면에서 접어 숨기는 건 API가 아니라 클라이언트의 "완료된 항목 보기" 토글이 담당한다.
  const dateOrTypeFilter = {
    OR: [{ dueDate: { lt: endOfDay(referenceDate) } }, { taskType: WORK_TASK_TYPE }],
  };

  // 전체 공통(WorkTask.isSharedTask) 업무는 특정 담당자 소유가 아니라 모든 직원 화면에
  // 동일하게 노출돼야 하므로, 담당자 필터가 걸려 있어도 별도로 포함시킨다. 검사 리마인더
  // (EXAM_REMINDER)도 항상 담당자 미지정(전체공통)이라 동일하게 별도 포함시킨다.
  const staffFilter = staffUserId
    ? {
        OR: [
          { staffUserId: Number(staffUserId) },
          { workTask: { isSharedTask: true } },
          { taskType: EXAM_REMINDER_TASK_TYPE },
        ],
      }
    : {};

  const tasks = await prisma.todoTask.findMany({
    where: { AND: [dateOrTypeFilter, staffFilter] },
    include: TODO_TASK_INCLUDE,
    orderBy: { dueDate: "asc" },
  });

  // WORK은 마감일이 없을 수 있어 SQLite의 기본 정렬(널이 맨 앞)로는 "마감 임박순, 없으면
  // 맨 뒤" 요구를 만족 못한다 — 마감일 없는 항목을 뒤로 보내도록 다시 정렬한다.
  // 톡/처방은 항상 마감일이 있어 이 재정렬이 기존 순서에 영향을 주지 않는다.
  tasks.sort((a, b) => {
    if (a.dueDate === null && b.dueDate === null) return 0;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });

  const talkPatientIds = tasks
    .filter((t): t is typeof t & { patientId: number } => t.patientId !== null)
    .map((t) => t.patientId);
  const logByPatientKey = await findMessageLogsByPatientAndType(talkPatientIds, TALK_MESSAGE_LOG_TYPES);

  const programEventTaskIds = tasks
    .filter((t) => t.patientId === null && isMessageTaskType(t.taskType))
    .map((t) => t.id);
  const logByTaskId = await findProgramEventLogsByTodoTaskIds(programEventTaskIds);

  const normalized = tasks
    .map((task) => {
      const eventLog = task.patientId
        ? (logByPatientKey.get(`${task.patientId}:${task.taskType}`) ?? null)
        : (logByTaskId.get(task.id) ?? null);
      return normalizeTodoTask(task, eventLog);
    })
    .filter(hasResolvedPatient);

  return NextResponse.json(normalized);
}
