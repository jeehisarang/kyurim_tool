import { prisma } from "@/lib/db";
import { createWithShortToken } from "@/lib/short-token";
import { TRIAL_REFERRAL_BONUS_AMOUNT, computeTrialReferralExpiry } from "@/lib/referral-config";

const REFERRAL_KIND_TRIAL = "TRIAL";
const CREDIT_KIND_TRIAL_SIGNUP = "TRIAL_SIGNUP";

/**
 * 3일체험(FIXED_SEQUENCE) Prescription 등록 시 자동 발급되는 추천링크(task.md).
 * createPrescription()의 FIXED_SEQUENCE 분기에서 prescription 생성 직후 호출한다 —
 * 이 코드베이스는 다단계 생성에 $transaction을 쓰지 않는 기존 관례를 그대로 따라
 * 순차 await로 처리한다.
 */
export async function issueTrialReferralLink(prescription: {
  id: number;
  patientId: number;
  startDate: Date;
}): Promise<void> {
  await createWithShortToken((token) =>
    prisma.referralLink.create({
      data: {
        token,
        patientId: prescription.patientId,
        kind: REFERRAL_KIND_TRIAL,
        sourcePrescriptionId: prescription.id,
        expiresAt: computeTrialReferralExpiry(prescription.startDate),
      },
    }),
  );
}

export type TrialApplicationInput = {
  name: string;
  phone: string;
  heightWeight?: string;
  weightGoalKg?: string;
  weightChange6mo?: string;
  currentMeds?: string;
  pastHistory?: string;
  familyHistory?: string;
  dietExperience?: string;
  bodyType1: string;
  bodyType1Other?: string;
  bodyType2: string;
  bodyType2Other?: string;
  bodyType3: string;
  bodyType3Other?: string;
  bodyType4: string;
  bodyType4Other?: string;
  bodyType5: string;
  bodyType5Other?: string;
  bodyType6: string;
  bodyType6Other?: string;
  referralToken?: string;
};

/**
 * 공개 신청페이지(/refer/trial[/token]) 제출 처리(task.md). referralToken이 유효(존재+
 * 활성+만료 전)하면 즉시 링크 소유자에게 크레딧을 적립한다 — 무효/만료/없음은 전부 조용히
 * 건너뛰고 신청 자체는 항상 성공시킨다(신청자에게 안내 없음, task.md 지시).
 */
export async function createTrialApplication(input: TrialApplicationInput) {
  const application = await prisma.trialApplication.create({ data: input });

  if (input.referralToken) {
    const link = await prisma.referralLink.findUnique({ where: { token: input.referralToken } });
    if (link && link.isActive && link.expiresAt.getTime() > Date.now()) {
      await prisma.referralCreditEntry.create({
        data: {
          patientId: link.patientId,
          linkToken: input.referralToken,
          kind: CREDIT_KIND_TRIAL_SIGNUP,
          amount: TRIAL_REFERRAL_BONUS_AMOUNT,
          referredName: input.name,
          referredTrialApplicationId: application.id,
        },
      });
    }
  }

  return application;
}

export function listUnconvertedTrialApplications() {
  return prisma.trialApplication.findMany({
    where: { convertedPrescriptionId: null },
    orderBy: { submittedAt: "desc" },
  });
}

export function getTrialApplicationById(id: number) {
  return prisma.trialApplication.findUnique({ where: { id } });
}

export async function linkTrialApplicationToPrescription(
  trialApplicationId: number,
  prescriptionId: number,
): Promise<void> {
  await prisma.trialApplication.update({
    where: { id: trialApplicationId },
    data: { convertedPrescriptionId: prescriptionId },
  });
}
