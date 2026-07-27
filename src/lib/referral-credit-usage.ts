import { prisma } from "@/lib/db";

const CREDIT_STATUS_CONFIRMED = "CONFIRMED";

export type PatientCreditBalance = {
  totalEarned: number;
  totalUsed: number;
  balance: number;
};

/**
 * 환자별 적립금 잔액(task.md) — 체험/본프로그램 구분 없이 CONFIRMED 적립 전체 합계에서
 * 사용 내역(ReferralCreditUsage) 합계를 뺀 값. 전체현황 화면(/settings/referral-credits)과
 * 환자 개인화면(/refer/my/[token]) 둘 다 이 함수 하나만 재사용해 계산 기준이 갈라지지 않게 한다.
 */
export async function getPatientCreditBalance(patientId: number): Promise<PatientCreditBalance> {
  const [confirmedEntries, usages] = await Promise.all([
    prisma.referralCreditEntry.findMany({
      where: { patientId, status: CREDIT_STATUS_CONFIRMED },
      select: { amount: true },
    }),
    prisma.referralCreditUsage.findMany({ where: { patientId }, select: { amount: true } }),
  ]);
  const totalEarned = confirmedEntries.reduce((sum, e) => sum + e.amount, 0);
  const totalUsed = usages.reduce((sum, u) => sum + u.amount, 0);
  return { totalEarned, totalUsed, balance: totalEarned - totalUsed };
}

// 전체현황 화면(/settings/referral-credits)이 환자마다 개별 쿼리를 날리지 않도록 한 번에
// 전체 환자의 사용 합계를 모아서 반환한다(N+1 방지).
export async function listAllPatientUsageTotals(): Promise<Map<number, number>> {
  const grouped = await prisma.referralCreditUsage.groupBy({
    by: ["patientId"],
    _sum: { amount: true },
  });
  return new Map(grouped.map((g) => [g.patientId, g._sum.amount ?? 0]));
}

export type ReferralCreditUsageView = {
  id: number;
  amount: number;
  memo: string | null;
  createdAt: Date;
  staffUserName: string;
};

/**
 * 관리자용(전체현황 화면) 사용 내역 조회 — 처리 직원명 포함. 환자 개인화면(/refer/my/[token])은
 * 직원 이름을 노출하면 안 되므로(task.md), 그쪽은 이 결과에서 staffUserName만 제거해서 쓴다.
 */
export async function listReferralCreditUsageForPatient(patientId: number): Promise<ReferralCreditUsageView[]> {
  const usages = await prisma.referralCreditUsage.findMany({
    where: { patientId },
    include: { staffUser: true },
    orderBy: { createdAt: "desc" },
  });
  return usages.map((u) => ({
    id: u.id,
    amount: u.amount,
    memo: u.memo,
    createdAt: u.createdAt,
    staffUserName: u.staffUser.name,
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
    },
  });
}
