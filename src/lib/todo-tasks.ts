import { prisma } from "@/lib/db";
import { isMessageTaskType } from "@/lib/task-types";

export const TODO_TASK_INCLUDE = {
  prescription: { include: { patient: true, program: true } },
  patient: true,
  staffUser: true,
  doneByUser: true,
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
 */
export function normalizeTodoTask(task: RawTodoTask, eventLog: EventLogLite) {
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
