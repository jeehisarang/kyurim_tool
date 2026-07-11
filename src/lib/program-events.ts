import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { MESSAGE_TYPE_LABEL } from "@/lib/message-templates";

export async function getProgramEventDetail(todoTaskId: number) {
  const task = await prisma.todoTask.findUniqueOrThrow({
    where: { id: todoTaskId },
    include: { prescription: { include: { patient: true, program: true } } },
  });
  const log = await prisma.programEventLog.findUnique({
    where: { todoTaskId },
    include: { staffUser: true, skippedByUser: true },
  });
  return { task, log };
}

/**
 * ProgramEventLog upsert — FIXED_SEQUENCE 프로그램(예: 킬팻캡슐 3일체험)의 톡류 TodoTask
 * 발송확인. messages.ts의 confirmMessage()와 같은 역할이지만 MessageLog가 아니라
 * TodoTask 1:1의 ProgramEventLog를 진실원천으로 쓴다 (재등록 시 유니크 충돌 방지, 스키마 설계 참고).
 */
export async function confirmProgramEvent(input: {
  todoTaskId: number;
  staffUserId: number;
  patientMessage?: string;
  internalAnalysis?: string;
}) {
  const { todoTaskId, staffUserId, patientMessage, internalAnalysis } = input;

  const [log, task, staffUser] = await Promise.all([
    prisma.programEventLog.upsert({
      where: { todoTaskId },
      update: {
        sentDate: new Date(),
        staffUserId,
        skippedAt: null,
        skippedByUserId: null,
        ...(patientMessage !== undefined ? { patientMessage } : {}),
        ...(internalAnalysis !== undefined ? { internalAnalysis } : {}),
      },
      create: {
        todoTaskId,
        sentDate: new Date(),
        staffUserId,
        patientMessage: patientMessage ?? null,
        internalAnalysis: internalAnalysis ?? null,
      },
      include: { staffUser: true, skippedByUser: true },
    }),
    prisma.todoTask.findUniqueOrThrow({
      where: { id: todoTaskId },
      include: { prescription: { include: { patient: true } } },
    }),
    prisma.staffUser.findUniqueOrThrow({ where: { id: staffUserId } }),
  ]);

  if (task.prescription) {
    await logActivity({
      actorType: "STAFF",
      actorId: staffUserId,
      actionType: "TALK_CONFIRM",
      label: `${staffUser.name}님이 ${task.prescription.patient.name}님 ${MESSAGE_TYPE_LABEL[task.taskType] ?? task.taskType} 발송을 확인했습니다`,
    });
  }

  return log;
}

export async function skipProgramEvent(input: { todoTaskId: number; staffUserId: number }) {
  const { todoTaskId, staffUserId } = input;

  return prisma.programEventLog.upsert({
    where: { todoTaskId },
    update: {
      skippedAt: new Date(),
      skippedByUserId: staffUserId,
    },
    create: {
      todoTaskId,
      skippedAt: new Date(),
      skippedByUserId: staffUserId,
    },
    include: { staffUser: true, skippedByUser: true },
  });
}
