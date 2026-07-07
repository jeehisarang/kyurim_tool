import { prisma } from "@/lib/db";

const AI_MESSAGE_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"];

/**
 * MessageLog upsert — /messages의 발송확인과 /todo의 톡 할일 체크가
 * 공유하는 유일한 진실 원천 갱신 지점.
 * aiDraftContent를 넘기지 않으면(예: /todo에서 체크) 기존 저장값을 그대로 둔다.
 */
export async function confirmMessage(input: {
  patientId: number;
  messageType: string;
  staffUserId: number;
  aiDraftContent?: string;
}) {
  const { patientId, messageType, staffUserId, aiDraftContent } = input;
  const isAiType = AI_MESSAGE_TYPES.includes(messageType);

  return prisma.messageLog.upsert({
    where: { patientId_messageType: { patientId, messageType } },
    update: {
      sentDate: new Date(),
      staffUserId,
      ...(isAiType && aiDraftContent !== undefined ? { aiDraftContent } : {}),
    },
    create: {
      patientId,
      messageType,
      sentDate: new Date(),
      staffUserId,
      aiDraftContent: isAiType ? (aiDraftContent ?? null) : null,
    },
    include: { staffUser: true },
  });
}
