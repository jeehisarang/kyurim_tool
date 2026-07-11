import { prisma } from "@/lib/db";

export type ActivityActorType = "STAFF" | "PATIENT" | "SYSTEM";

/**
 * 실시간 활동피드(우측 고정 레일) 기록 — 조용한 동기부여용 로그일 뿐이라, 이 호출이
 * 실패해도(예: 순간적 DB 잠금) 원래 하려던 작업(업무 등록, 톡 발송확인 등)까지 실패로
 * 되돌리면 안 된다. 그래서 에러를 여기서 삼키고 호출부는 그냥 await만 하면 되게 한다.
 */
export async function logActivity(input: {
  actorType: ActivityActorType;
  actorId?: number | null;
  actionType: string;
  label: string;
}): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        actionType: input.actionType,
        label: input.label,
      },
    });
  } catch (err) {
    console.error("[activity-log] 기록 실패:", err);
  }
}

export async function listRecentActivity(limit = 15) {
  return prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
