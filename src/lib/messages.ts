import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { MESSAGE_TYPE_LABEL } from "@/lib/message-templates";

const AI_MESSAGE_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"];

/**
 * MessageLog upsert — /messages의 발송확인과 /todo의 톡 할일 체크가
 * 공유하는 유일한 진실 원천 갱신 지점.
 * aiDraftContent를 넘기지 않으면(예: /todo에서 체크) 기존 저장값을 그대로 둔다.
 * 이전에 보류(SKIPPED)됐던 건도 실제 발송하면 보류 상태를 지워 3분류가 겹치지 않게 한다.
 */
export async function confirmMessage(input: {
  patientId: number;
  messageType: string;
  staffUserId: number;
  aiDraftContent?: string;
}) {
  const { patientId, messageType, staffUserId, aiDraftContent } = input;
  const isAiType = AI_MESSAGE_TYPES.includes(messageType);

  const log = await prisma.messageLog.upsert({
    where: { patientId_messageType: { patientId, messageType } },
    update: {
      sentDate: new Date(),
      staffUserId,
      skippedAt: null,
      skippedByUserId: null,
      ...(isAiType && aiDraftContent !== undefined ? { aiDraftContent } : {}),
    },
    create: {
      patientId,
      messageType,
      sentDate: new Date(),
      staffUserId,
      aiDraftContent: isAiType ? (aiDraftContent ?? null) : null,
    },
    include: { staffUser: true, skippedByUser: true, patient: true },
  });

  await logActivity({
    actorType: "STAFF",
    actorId: staffUserId,
    actionType: "TALK_CONFIRM",
    label: `${log.staffUser?.name ?? "직원"}님이 ${log.patient.name}님 ${MESSAGE_TYPE_LABEL[messageType] ?? messageType} 발송을 확인했습니다`,
  });

  return log;
}

/**
 * 완료(DONE)도 미처리도 아닌 "보류" 상태로 표시.
 * TodoTask는 건드리지 않는다 — 보류 후에도 해당 TodoTask 행이 남아있는 덕분에
 * generateTalkTodos()의 중복 방지 로직이 자동으로 재생성을 막아준다.
 */
export async function skipMessage(input: {
  patientId: number;
  messageType: string;
  staffUserId: number;
}) {
  const { patientId, messageType, staffUserId } = input;

  return prisma.messageLog.upsert({
    where: { patientId_messageType: { patientId, messageType } },
    update: {
      skippedAt: new Date(),
      skippedByUserId: staffUserId,
    },
    create: {
      patientId,
      messageType,
      skippedAt: new Date(),
      skippedByUserId: staffUserId,
    },
    include: { staffUser: true, skippedByUser: true },
  });
}
