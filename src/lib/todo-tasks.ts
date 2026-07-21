import { prisma } from "@/lib/db";
import { isMessageTaskType, isWorkTaskType, isExamReminderTaskType } from "@/lib/task-types";
import { EXAM_REMINDER_TYPE_LABEL, isExamReminderExamType } from "@/lib/exam-reminders";

export const TODO_TASK_INCLUDE = {
  prescription: { include: { patient: true, program: true } },
  patient: true,
  staffUser: true,
  doneByUser: true,
  workTask: { include: { creator: true, assignee: true } },
  examReminderCycle: true,
} as const;

type RawTodoTask = Awaited<ReturnType<typeof fetchOne>>;

async function fetchOne(id: number) {
  return prisma.todoTask.findUniqueOrThrow({ where: { id }, include: TODO_TASK_INCLUDE });
}

type StaffUserLite = { id: number; name: string; role: string };

export type EventLogLite = {
  sentDate: Date | null;
  staffUser: StaffUserLite | null;
  skippedAt: Date | null;
  skippedByUser: StaffUserLite | null;
  aiDraftContent?: string | null;
  patientMessage?: string | null;
  internalAnalysis?: string | null;
} | null;

/**
 * 분류 기준은 "prescriptionId 유무"가 아니라 taskType이 메시지형(MESSAGE_TASK_TYPES)인지 여부다.
 * 메시지형은 항상 로그(MessageLog 또는 ProgramEventLog, 호출부에서 알맞은 쪽을 조회해 넘김)가
 * 완료/보류의 진실원천이며, TodoTask.isDone은 신뢰하지 않는다. 메시지형은 patientId 직결
 * (자가치유형 톡)과 prescriptionId 경유(프로그램 이벤트, 예: 킬팻캡슐 3일체험) 둘 다 가능하므로
 * patient/program은 있는 쪽에서 가져온다.
 * 체크형(NEXT_DOSE/FOLLOW_UP)은 항상 prescriptionId 경유이며 TodoTask.isDone이 진실원천.
 * WORK(업무/요청)도 체크형과 동일하게 TodoTask.isDone이 진실원천이지만, 환자/처방과
 * 무관하므로 patient/program이 항상 null이다(hasResolvedPatient에서 별도 허용 처리).
 */
export function normalizeTodoTask(task: RawTodoTask, eventLog: EventLogLite) {
  if (isWorkTaskType(task.taskType)) {
    return {
      id: task.id,
      category: "WORK" as const,
      taskType: task.taskType,
      title: task.workTask?.title ?? "업무",
      description: task.workTask?.description ?? null,
      creator: task.workTask?.creator ?? null,
      assignee: task.workTask?.assignee ?? null,
      isSharedTask: task.workTask?.isSharedTask ?? false,
      dueDate: task.dueDate,
      patient: null,
      program: null,
      staffUser: task.staffUser,
      isDone: task.isDone,
      doneByUser: task.doneByUser,
      skippedAt: null as Date | null,
      skippedByUser: null as StaffUserLite | null,
    };
  }

  if (isExamReminderTaskType(task.taskType)) {
    const cycleExamType = task.examReminderCycle?.examType;
    const examTypeLabel =
      cycleExamType && isExamReminderExamType(cycleExamType) ? EXAM_REMINDER_TYPE_LABEL[cycleExamType] : "검사";

    return {
      id: task.id,
      category: "EXAM_REMINDER" as const,
      taskType: task.taskType,
      title: `${examTypeLabel} 검사 시기 도래`,
      description: null,
      creator: null,
      assignee: null,
      isSharedTask: true,
      dueDate: task.dueDate,
      patient: task.patient,
      program: null,
      staffUser: task.staffUser,
      isDone: task.isDone,
      doneByUser: task.doneByUser,
      skippedAt: null as Date | null,
      skippedByUser: null as StaffUserLite | null,
    };
  }

  if (isMessageTaskType(task.taskType)) {
    const isDone = eventLog?.sentDate != null;

    return {
      id: task.id,
      category: "TALK" as const,
      taskType: task.taskType,
      dueDate: task.dueDate,
      patient: task.patient ?? task.prescription?.patient ?? null,
      program: task.prescription?.program ?? null,
      staffUser: task.staffUser,
      isDone,
      doneByUser: eventLog?.staffUser ?? null,
      skippedAt: isDone ? null : (eventLog?.skippedAt ?? null),
      skippedByUser: isDone ? null : (eventLog?.skippedByUser ?? null),
      // 자가치유형 톡은 aiDraftContent, 프로그램 이벤트는 patientMessage에 초안이 저장되므로
      // 소비 측(톡 관리 화면)에서 하나의 필드로 다루도록 통일해 넘긴다.
      draftContent: eventLog?.aiDraftContent ?? eventLog?.patientMessage ?? null,
      internalAnalysis: eventLog?.internalAnalysis ?? null,
    };
  }

  return {
    id: task.id,
    category: "PRESCRIPTION" as const,
    taskType: task.taskType,
    dueDate: task.dueDate,
    patient: task.prescription!.patient,
    program: task.prescription!.program,
    staffUser: task.staffUser,
    isDone: task.isDone,
    doneByUser: task.doneByUser,
    skippedAt: null as Date | null,
    skippedByUser: null as StaffUserLite | null,
  };
}

/**
 * 메시지형/체크형 TodoTask인데 patientId/prescriptionId가 둘 다 없거나 prescription이
 * 가리키는 환자가 없어서 patient를 끝내 못 찾은 경우(고아 행 — 정상 흐름에서는
 * 생기지 않지만, 과거 데이터 정리 실수 등으로 남을 수 있음) API 응답에서 제외한다.
 * 프론트(TodoTaskTable.buildTaskRows)는 patient가 항상 있다고 가정하고 그룹핑하므로,
 * 여기서 걸러내지 않으면 화면 전체가 크래시한다.
 * WORK(업무/요청)는 애초에 환자와 무관해 patient가 항상 null이므로 이 검사 대상이 아니다.
 */
export function hasResolvedPatient(task: ReturnType<typeof normalizeTodoTask>): boolean {
  if (task.category === "WORK") return true;
  if (task.patient === null) {
    console.warn(`TodoTask ${task.id}: patient를 찾을 수 없어 목록에서 제외합니다(고아 행).`);
    return false;
  }
  return true;
}

export async function findMessageLogsByPatientAndType(
  patientIds: number[],
  messageTypes: readonly string[],
): Promise<Map<string, EventLogLite>> {
  const map = new Map<string, EventLogLite>();
  if (patientIds.length === 0) return map;

  const logs = await prisma.messageLog.findMany({
    where: { patientId: { in: patientIds }, messageType: { in: [...messageTypes] } },
    include: { staffUser: true, skippedByUser: true },
  });
  for (const log of logs) {
    map.set(`${log.patientId}:${log.messageType}`, log);
  }
  return map;
}

export async function findProgramEventLogsByTodoTaskIds(
  todoTaskIds: number[],
): Promise<Map<number, EventLogLite>> {
  const map = new Map<number, EventLogLite>();
  if (todoTaskIds.length === 0) return map;

  const logs = await prisma.programEventLog.findMany({
    where: { todoTaskId: { in: todoTaskIds } },
    include: { staffUser: true, skippedByUser: true },
  });
  for (const log of logs) {
    map.set(log.todoTaskId, log);
  }
  return map;
}
