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

export type ActivityLogListRow = {
  id: number;
  actorType: ActivityActorType;
  actorId: number | null;
  actionType: string;
  label: string;
  createdAt: Date;
  isChecked: boolean;
  checkedByStaffName: string | null;
};

export async function listRecentActivity(limit = 15): Promise<ActivityLogListRow[]> {
  const rows = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { checkedByStaff: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    actorType: row.actorType as ActivityActorType,
    actorId: row.actorId,
    actionType: row.actionType,
    label: row.label,
    createdAt: row.createdAt,
    isChecked: row.isChecked,
    checkedByStaffName: row.checkedByStaff?.name ?? null,
  }));
}

export class ActivityLogNotFoundError extends Error {
  constructor() {
    super("활동 항목을 찾을 수 없습니다.");
    this.name = "ActivityLogNotFoundError";
  }
}

export class ActivityLogNotPatientError extends Error {
  constructor() {
    super("환자 활동 항목만 확인할 수 있습니다.");
    this.name = "ActivityLogNotPatientError";
  }
}

export class ActivityLogAlreadyCheckedError extends Error {
  checkedByStaffName: string | null;
  constructor(checkedByStaffName: string | null) {
    super("이미 다른 사람이 확인했습니다.");
    this.name = "ActivityLogAlreadyCheckedError";
    this.checkedByStaffName = checkedByStaffName;
  }
}

// "OOO님이 [프로그램명] 프로그램문의하기를 눌렀습니다" -> "OOO님 [프로그램명] 프로그램문의하기"
// (task.md 예시) — 새로 남기는 "확인했습니다" 로그가 원본 문장을 그대로 인용하면 장황해지니
// 주격조사("이")와 서술어 꼬리("를/을 눌렀습니다")만 제거해 명사구처럼 짧게 참조한다.
// 패턴에 맞지 않는 미래의 PATIENT 로그 문구는 원문 그대로(길이만 제한) 사용한다.
function summarizeLabel(label: string): string {
  const summary = label.replace(/님이(\s)/, "님$1").replace(/(를|을)\s*눌렀습니다\s*$/, "").trim();
  const result = summary || label;
  return result.length > 60 ? `${result.slice(0, 60)}…` : result;
}

/**
 * PATIENT 활동 로그 "확인" 체크(task.md) — isChecked=false 조건의 원자적 updateMany로
 * 최초 1명만 성공하게 한다(count===0이면 그 사이 다른 사람이 이미 체크한 것 — 409로
 * 알려주며 누가 체크했는지 함께 반환). 성공하면 "{이름}님이 확인했습니다" STAFF 로그를
 * 새로 남긴다 — actorType이 STAFF라 화면에서 체크박스 대상이 되지 않는다(무한 체인 방지).
 */
export async function checkActivityLog(activityLogId: number, staffId: number): Promise<void> {
  const [existing, staff] = await Promise.all([
    prisma.activityLog.findUnique({ where: { id: activityLogId } }),
    prisma.staffUser.findUniqueOrThrow({ where: { id: staffId } }),
  ]);
  if (!existing) throw new ActivityLogNotFoundError();
  if (existing.actorType !== "PATIENT") throw new ActivityLogNotPatientError();

  const updated = await prisma.activityLog.updateMany({
    where: { id: activityLogId, isChecked: false },
    data: { isChecked: true, checkedByStaffId: staffId, checkedAt: new Date() },
  });

  if (updated.count === 0) {
    const current = await prisma.activityLog.findUnique({
      where: { id: activityLogId },
      include: { checkedByStaff: { select: { name: true } } },
    });
    throw new ActivityLogAlreadyCheckedError(current?.checkedByStaff?.name ?? null);
  }

  await logActivity({
    actorType: "STAFF",
    actorId: staffId,
    actionType: "ACTIVITY_CHECK",
    label: `${staff.name}님이 '${summarizeLabel(existing.label)}' 확인했습니다`,
  });
}
