import { prisma } from "@/lib/db";
import { createWithShortToken } from "@/lib/short-token";
import { TRIAL_REFERRAL_BONUS_AMOUNT, computeTrialReferralExpiry } from "@/lib/referral-config";
import { logActivity } from "@/lib/activity-log";
import { createWorkTask } from "@/lib/work-tasks";
import { startOfDay, getSystemStaffUserId } from "@/lib/teaching-pages";
import { WORK_TASK_TYPE } from "@/lib/task-types";
import { BODY_TYPE_MAX_SELECTIONS } from "@/lib/trial-application-format";

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
  // 문항당 최대 2개(task.md 보완 1항) — createTrialApplication이 JSON.stringify해서 저장한다.
  bodyType1: string[];
  bodyType1Other?: string;
  bodyType2: string[];
  bodyType2Other?: string;
  bodyType3: string[];
  bodyType3Other?: string;
  bodyType4: string[];
  bodyType4Other?: string;
  bodyType5: string[];
  bodyType5Other?: string;
  bodyType6: string[];
  bodyType6Other?: string;
  referralToken?: string;
};

export class InvalidBodyTypeSelectionError extends Error {
  constructor() {
    super(`몸타입 문항은 1~${BODY_TYPE_MAX_SELECTIONS}개까지 선택해야 합니다.`);
    this.name = "InvalidBodyTypeSelectionError";
  }
}

const BODY_TYPE_KEYS = ["bodyType1", "bodyType2", "bodyType3", "bodyType4", "bodyType5", "bodyType6"] as const;

/**
 * 새 신청 접수 콜백 업무(task.md 보완 2항) — teaching-pages.ts의 requestConsultCallback과
 * 동일한 패턴(전체공통 WORK, 당일 중복방지). TrialApplication은 아직 Patient가 아니라
 * patientId로 dedup할 수 없어, 전화번호를 제목에 포함시켜 그 문자열로 대신 dedup한다.
 * 카카오 연결 성공 여부와 무관하게 항상 호출된다(전화 폴백을 위한 안전장치).
 */
async function requestTrialApplicationCallback(application: { name: string; phone: string }): Promise<void> {
  const existingOpen = await prisma.todoTask.findFirst({
    where: {
      taskType: WORK_TASK_TYPE,
      isDone: false,
      createdAt: { gte: startOfDay(new Date()) },
      workTask: { title: { contains: application.phone } },
    },
  });
  if (existingOpen) return;

  const systemStaffId = await getSystemStaffUserId();
  await createWorkTask({
    title: `${application.name}님 체험 신청 접수 — 연락 필요 (${application.phone})`,
    creatorId: systemStaffId,
    isSharedTask: true,
    dueDate: null,
  });
}

/**
 * 공개 신청페이지(/refer/trial[/token]) 제출 처리(task.md). referralToken이 유효(존재+
 * 활성+만료 전)하면 즉시 링크 소유자에게 크레딧을 적립한다 — 무효/만료/없음은 전부 조용히
 * 건너뛰고 신청 자체는 항상 성공시킨다(신청자에게 안내 없음, task.md 지시). 접수 즉시
 * 활동피드 기록 + 콜백 업무 생성(task.md 보완 2·4항)도 함께 처리한다.
 */
export async function createTrialApplication(input: TrialApplicationInput) {
  for (const key of BODY_TYPE_KEYS) {
    const values = input[key];
    if (!Array.isArray(values) || values.length < 1 || values.length > BODY_TYPE_MAX_SELECTIONS) {
      throw new InvalidBodyTypeSelectionError();
    }
  }

  const data = {
    name: input.name,
    phone: input.phone,
    heightWeight: input.heightWeight,
    weightGoalKg: input.weightGoalKg,
    weightChange6mo: input.weightChange6mo,
    currentMeds: input.currentMeds,
    pastHistory: input.pastHistory,
    familyHistory: input.familyHistory,
    dietExperience: input.dietExperience,
    bodyType1: JSON.stringify(input.bodyType1),
    bodyType1Other: input.bodyType1Other,
    bodyType2: JSON.stringify(input.bodyType2),
    bodyType2Other: input.bodyType2Other,
    bodyType3: JSON.stringify(input.bodyType3),
    bodyType3Other: input.bodyType3Other,
    bodyType4: JSON.stringify(input.bodyType4),
    bodyType4Other: input.bodyType4Other,
    bodyType5: JSON.stringify(input.bodyType5),
    bodyType5Other: input.bodyType5Other,
    bodyType6: JSON.stringify(input.bodyType6),
    bodyType6Other: input.bodyType6Other,
    referralToken: input.referralToken,
  };

  const application = await prisma.trialApplication.create({ data });

  await requestTrialApplicationCallback({ name: input.name, phone: input.phone });

  await logActivity({
    actorType: "PATIENT",
    actorId: null,
    actionType: "TRIAL_APPLICATION_SUBMIT",
    label: input.referralToken
      ? `${input.name}님이 추천으로 킬팻캡슐 3일체험을 신청했습니다`
      : `${input.name}님이 킬팻캡슐 3일체험을 신청했습니다`,
  });

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

// 신청 응답 전체보기(task.md 보완 1항, /refer/applications) — 전환 여부 무관 전체 목록.
export function listAllTrialApplications() {
  return prisma.trialApplication.findMany({ orderBy: { submittedAt: "desc" } });
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
