import { prisma } from "@/lib/db";

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

type MessageLogLite = {
  sentDate: Date | null;
  staffUser: StaffUserLite | null;
  skippedAt: Date | null;
  skippedByUser: StaffUserLite | null;
} | null;

/**
 * 처방 할일은 저장된 isDone/doneByUser를 그대로 쓰고,
 * 톡 할일은 항상 MessageLog 조회 결과로 완료/보류 여부를 재계산한다
 * (TodoTask.isDone은 톡 항목에서는 절대 신뢰하지 않는 진실 원천 아님 필드).
 * sentDate가 있으면 DONE, 없고 skippedAt만 있으면 SKIPPED, 둘 다 없으면 PENDING.
 */
export function normalizeTodoTask(task: RawTodoTask, talkLog: MessageLogLite) {
  if (task.prescriptionId) {
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

  const isDone = talkLog?.sentDate != null;

  return {
    id: task.id,
    category: "TALK" as const,
    taskType: task.taskType,
    dueDate: task.dueDate,
    patient: task.patient,
    program: null,
    staffUser: task.staffUser,
    isDone,
    doneByUser: talkLog?.staffUser ?? null,
    skippedAt: isDone ? null : (talkLog?.skippedAt ?? null),
    skippedByUser: isDone ? null : (talkLog?.skippedByUser ?? null),
  };
}

export async function findMessageLogsByPatientAndType(
  patientIds: number[],
  messageTypes: readonly string[],
): Promise<Map<string, MessageLogLite>> {
  const map = new Map<string, MessageLogLite>();
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
