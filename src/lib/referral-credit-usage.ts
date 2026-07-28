import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";

const CREDIT_STATUS_CONFIRMED = "CONFIRMED";

// 크레딧 만료 판정 공용 규칙(task.md 추천 크레딧 1년 유효기간 도입) — expiresAt=null이면
// 무기한, 값이 있으면 그 날짜 이후 만료. 추천 크레딧(TRIAL_SIGNUP/MAIN_SIGNUP, 1년 유효)과
// 미션 크레딧(MISSION_QUIZ/PHOTO/TEXT, 6개월 유효) 전부 이 하나의 규칙만 따른다 — kind별로
// 분기하지 않는다. 기존(반영 이전) CONFIRMED 추천 크레딧은 expiresAt이 null로 남아있어
// 그대로 무기한 유지된다(소급 적용 없음).
export function isCreditExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  return expiresAt !== null && expiresAt < now;
}

// 위와 동일한 규칙의 Prisma where 조각 — DB 쿼리 단계에서 만료분을 걸러낼 때 재사용한다.
export function notExpiredWhereClause(now: Date = new Date()) {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

export type PatientCreditBalance = {
  totalEarned: number;
  totalUsed: number;
  balance: number;
};

/**
 * 환자별 적립금 잔액(task.md) — 체험/본프로그램 구분 없이 CONFIRMED 적립 전체 합계에서
 * 사용 내역(ReferralCreditUsage) 합계를 뺀 값. 전체현황 화면(/settings/referral-credits)과
 * 환자 개인화면(/refer/my/[token]) 둘 다 이 함수 하나만 재사용해 계산 기준이 갈라지지 않게 한다.
 *
 * 크레딧 유효기간(task.md) — expiresAt이 있고 오늘보다 과거인 항목은 잔액 계산에서
 * 제외한다(notExpiredWhereClause, 미션/추천 크레딧 공통 규칙).
 *
 * 사용처리 취소(task.md 수정/취소 기능) — isCancelled=true인 사용내역은 "사용 안 한 것"으로
 * 취급해 합계에서 제외한다. 별도 트리거 없이 이 함수가 매번 최신 상태를 다시 읽어오므로
 * 취소/수정 즉시 잔액에 반영된다.
 */
export async function getPatientCreditBalance(patientId: number): Promise<PatientCreditBalance> {
  const [confirmedEntries, usages] = await Promise.all([
    prisma.referralCreditEntry.findMany({
      where: {
        patientId,
        status: CREDIT_STATUS_CONFIRMED,
        ...notExpiredWhereClause(),
      },
      select: { amount: true },
    }),
    prisma.referralCreditUsage.findMany({ where: { patientId, isCancelled: false }, select: { amount: true } }),
  ]);
  const totalEarned = confirmedEntries.reduce((sum, e) => sum + e.amount, 0);
  const totalUsed = usages.reduce((sum, u) => sum + u.amount, 0);
  return { totalEarned, totalUsed, balance: totalEarned - totalUsed };
}

// 전체현황 화면(/settings/referral-credits)이 환자마다 개별 쿼리를 날리지 않도록 한 번에
// 전체 환자의 사용 합계를 모아서 반환한다(N+1 방지). 취소된 건은 제외(getPatientCreditBalance와 동일 원칙).
export async function listAllPatientUsageTotals(): Promise<Map<number, number>> {
  const grouped = await prisma.referralCreditUsage.groupBy({
    by: ["patientId"],
    where: { isCancelled: false },
    _sum: { amount: true },
  });
  return new Map(grouped.map((g) => [g.patientId, g._sum.amount ?? 0]));
}

export type ReferralCreditUsageView = {
  id: number;
  amount: number;
  memo: string | null;
  // 실제 사용일(수정 가능, task.md) — 화면 표시는 항상 이 값을 쓴다(createdAt은 시스템
  // 기록 생성 시각일 뿐이라 더 이상 노출하지 않음).
  usedAt: Date;
  staffUserName: string;
  isCancelled: boolean;
  cancelledAt: Date | null;
  editedAt: Date | null;
};

/**
 * 관리자용(전체현황 화면) 사용 내역 조회 — 처리 직원명 포함, 취소된 건도 감사 목적으로
 * 그대로 노출한다(화면에서 "취소됨" 표시만 다르게). 환자 개인화면(/refer/my/[token])은
 * 직원 이름을 노출하면 안 되고(task.md) 취소된 건은 애초에 "사용한 적 없는 것"으로 보이게
 * referrals.ts에서 isCancelled 항목을 걸러내고 이 결과를 쓴다.
 */
export async function listReferralCreditUsageForPatient(patientId: number): Promise<ReferralCreditUsageView[]> {
  const usages = await prisma.referralCreditUsage.findMany({
    where: { patientId },
    include: { staffUser: true },
    orderBy: { usedAt: "desc" },
  });
  return usages.map((u) => ({
    id: u.id,
    amount: u.amount,
    memo: u.memo,
    usedAt: u.usedAt,
    staffUserName: u.staffUser.name,
    isCancelled: u.isCancelled,
    cancelledAt: u.cancelledAt,
    editedAt: u.editedAt,
  }));
}

export class InvalidCreditUsageAmountError extends Error {
  constructor() {
    super("사용 금액은 0보다 커야 합니다.");
    this.name = "InvalidCreditUsageAmountError";
  }
}

export async function createReferralCreditUsage(input: {
  patientId: number;
  amount: number;
  memo?: string | null;
  staffUserId: number;
  usedAt?: Date;
}) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new InvalidCreditUsageAmountError();
  }
  return prisma.referralCreditUsage.create({
    data: {
      patientId: input.patientId,
      amount: Math.round(input.amount),
      memo: input.memo?.trim() || null,
      staffUserId: input.staffUserId,
      usedAt: input.usedAt ?? new Date(),
    },
  });
}

export class ReferralCreditUsageNotFoundError extends Error {
  constructor() {
    super("사용 내역을 찾을 수 없습니다.");
    this.name = "ReferralCreditUsageNotFoundError";
  }
}

export class ReferralCreditUsageAlreadyCancelledError extends Error {
  constructor() {
    super("이미 취소된 사용 내역입니다.");
    this.name = "ReferralCreditUsageAlreadyCancelledError";
  }
}

function formatKrDate(d: Date): string {
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/**
 * 적립금 사용내역 수정(task.md) — 금액/사용일만 바꿀 수 있다. 감사 이력은 두 겹으로 남긴다:
 * ① ActivityLog에 "누가/언제/무엇을 어떻게" 사람이 읽을 문장으로(여러 번 수정해도 각각
 *   새 로그로 누적됨), ② 레코드 자체엔 editedAt/editedByStaffId만(최근 수정 여부를
 *   목록에서 바로 보여주기 위한 용도, 상세 서술은 ①에 있음).
 * 취소된 건은 더 이상 수정할 수 없다(먼저 취소를 되돌리는 기능 자체가 없음 — 필요하면
 * 새로 사용처리하면 된다).
 */
export async function editReferralCreditUsage(input: {
  usageId: number;
  amount: number;
  usedAt: Date;
  staffUserId: number;
}) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new InvalidCreditUsageAmountError();
  }
  const existing = await prisma.referralCreditUsage.findUnique({
    where: { id: input.usageId },
    include: { patient: true, staffUser: true },
  });
  if (!existing) throw new ReferralCreditUsageNotFoundError();
  if (existing.isCancelled) throw new ReferralCreditUsageAlreadyCancelledError();

  const editingStaff = await prisma.staffUser.findUnique({ where: { id: input.staffUserId } });
  const now = new Date();

  const updated = await prisma.referralCreditUsage.update({
    where: { id: input.usageId },
    data: {
      amount: Math.round(input.amount),
      usedAt: input.usedAt,
      editedAt: now,
      editedByStaffId: input.staffUserId,
    },
  });

  await logActivity({
    actorType: "STAFF",
    actorId: input.staffUserId,
    actionType: "CREDIT_USAGE_EDIT",
    label:
      `${editingStaff?.name ?? "직원"}님이 ${existing.patient.name}님의 적립금 사용내역을 수정했습니다: ` +
      `${existing.amount.toLocaleString()}원(${formatKrDate(existing.usedAt)}) → ` +
      `${updated.amount.toLocaleString()}원(${formatKrDate(updated.usedAt)})`,
  });

  return updated;
}

/**
 * 적립금 사용내역 취소(소프트 삭제, task.md) — 물리 삭제 대신 isCancelled만 세운다(이
 * 코드베이스의 기존 소프트 삭제 원칙). 잔액 계산이 isCancelled=false만 합산하므로 별도
 * 트리거 없이 취소 즉시 그 금액만큼 잔액이 복구된다.
 */
export async function cancelReferralCreditUsage(usageId: number, staffUserId: number) {
  const existing = await prisma.referralCreditUsage.findUnique({
    where: { id: usageId },
    include: { patient: true },
  });
  if (!existing) throw new ReferralCreditUsageNotFoundError();
  if (existing.isCancelled) throw new ReferralCreditUsageAlreadyCancelledError();

  const cancellingStaff = await prisma.staffUser.findUnique({ where: { id: staffUserId } });
  const now = new Date();

  const updated = await prisma.referralCreditUsage.update({
    where: { id: usageId },
    data: { isCancelled: true, cancelledAt: now, cancelledByStaffId: staffUserId },
  });

  await logActivity({
    actorType: "STAFF",
    actorId: staffUserId,
    actionType: "CREDIT_USAGE_CANCEL",
    label:
      `${cancellingStaff?.name ?? "직원"}님이 ${existing.patient.name}님의 적립금 사용내역` +
      `(${existing.amount.toLocaleString()}원, ${formatKrDate(existing.usedAt)})을 취소했습니다 — ` +
      `잔액 ${existing.amount.toLocaleString()}원 복구`,
  });

  return updated;
}
