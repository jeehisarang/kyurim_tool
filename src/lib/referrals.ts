import { prisma } from "@/lib/db";
import { createWithShortToken } from "@/lib/short-token";
import {
  TRIAL_REFERRAL_BONUS_AMOUNT,
  MAIN_REFERRAL_BONUS_AMOUNT,
  computeTrialReferralExpiry,
  computeMainReferralExpiry,
} from "@/lib/referral-config";
import { logActivity } from "@/lib/activity-log";
import { createWorkTask } from "@/lib/work-tasks";
import { startOfDay, getSystemStaffUserId } from "@/lib/teaching-pages";
import { WORK_TASK_TYPE } from "@/lib/task-types";
import { BODY_TYPE_MAX_SELECTIONS } from "@/lib/trial-application-format";

const REFERRAL_KIND_TRIAL = "TRIAL";
const CREDIT_KIND_TRIAL_SIGNUP = "TRIAL_SIGNUP";
const REFERRAL_KIND_MAIN = "MAIN";
const CREDIT_KIND_MAIN_SIGNUP = "MAIN_SIGNUP";
// MAIN_SIGNUP 적립(task.md Phase 3-2)은 공개 신청폼을 거치지 않고 직원이 처방등록 화면에서
// 환자를 검색해 직접 확정하는 방식이라(TRIAL_SIGNUP처럼 실제로 "쓰인 코드"가 없음), linkToken에
// 넣을 실제 코드가 없다. ReferralCreditEntry.linkToken이 FK가 아니라 감사용 문자열이라는
// 기존 설계 원칙(스키마 주석 참고)에 맞춰 고정 플레이스홀더를 쓴다.
const MANUAL_MAIN_REFERRAL_TOKEN = "MANUAL_MAIN_REFERRAL";

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

/**
 * 킬팻캡슐 본프로그램(1개월/3개월, SPLIT) Prescription 등록 시 자동 발급되는 추천링크
 * (task.md Phase 3-1) — issueTrialReferralLink와 동일한 후킹 패턴. 만료일은 이 처방의
 * 종료예정일(startDate+totalDurationDays)로, TRIAL의 고정 7일과 다르다.
 */
export async function issueMainReferralLink(prescription: {
  id: number;
  patientId: number;
  startDate: Date;
  totalDurationDays: number;
}): Promise<void> {
  await createWithShortToken((token) =>
    prisma.referralLink.create({
      data: {
        token,
        patientId: prescription.patientId,
        kind: REFERRAL_KIND_MAIN,
        sourcePrescriptionId: prescription.id,
        expiresAt: computeMainReferralExpiry(prescription.startDate, prescription.totalDurationDays),
      },
    }),
  );
}

/**
 * 처방등록 화면 "소개 확인" 섹션(task.md Phase 3-2) 확정 처리 — 추천인에게 70,000원
 * MAIN_SIGNUP 적립을 생성한다. 확정은 직원이 검색으로 추천인을 직접 지목하는 수동 절차라
 * TRIAL_SIGNUP과 달리 실제 소비된 링크 토큰이 없어 MANUAL_MAIN_REFERRAL_TOKEN을 쓴다.
 */
export async function confirmMainReferral(input: {
  referrerPatientId: number;
  referredPatientName: string;
  referredPrescriptionId: number;
  confirmedByStaffId: number;
}) {
  return prisma.referralCreditEntry.create({
    data: {
      patientId: input.referrerPatientId,
      linkToken: MANUAL_MAIN_REFERRAL_TOKEN,
      kind: CREDIT_KIND_MAIN_SIGNUP,
      amount: MAIN_REFERRAL_BONUS_AMOUNT,
      referredName: input.referredPatientName,
      referredPrescriptionId: input.referredPrescriptionId,
      confirmedByStaffId: input.confirmedByStaffId,
    },
  });
}

// 처방등록 화면에서 이 처방이 소개(MAIN_SIGNUP)로 확정된 등록인지 조회(task.md Phase 3-2
// "소개받음 - 3만원 할인 대상" 표시) — 별도 필드 추가 없이 ReferralCreditEntry에서 역참조한다.
export async function isDiscountEligiblePrescription(prescriptionId: number): Promise<boolean> {
  const entry = await prisma.referralCreditEntry.findFirst({
    where: { referredPrescriptionId: prescriptionId, kind: CREDIT_KIND_MAIN_SIGNUP },
  });
  return entry !== null;
}

export type TrialReferralHint = {
  referralToken: string;
  referrerPatientId: number;
  referrerPatientName: string;
};

/**
 * "소개 확인" 힌트(task.md Phase 3-2) — 이 환자가 예전에 체험 신청(TrialApplication) 당시
 * 추천코드로 들어왔다면, 그 코드 소유 환자를 본프로그램 추천인 후보로 자동 제시한다.
 * TrialApplication.convertedPrescriptionId → Prescription.patientId 경로로 "이 환자가 제출한
 * 체험신청"을 역으로 찾는다(신청 자체엔 patientId가 없고 전환된 처방을 통해서만 연결됨).
 */
export async function getTrialReferralHintForPatient(patientId: number): Promise<TrialReferralHint | null> {
  const application = await prisma.trialApplication.findFirst({
    where: { referralToken: { not: null }, prescription: { patientId } },
  });
  if (!application?.referralToken) return null;

  const link = await prisma.referralLink.findUnique({
    where: { token: application.referralToken },
    include: { patient: true },
  });
  if (!link) return null;

  return { referralToken: link.token, referrerPatientId: link.patientId, referrerPatientName: link.patient.name };
}

export type ReferralCreditPatientSummary = {
  patientId: number;
  patientName: string;
  chartNumber: string;
  trialTotal: number;
  mainTotal: number;
  total: number;
  entries: {
    id: number;
    kind: string;
    amount: number;
    referredName: string;
    createdAt: Date;
    confirmedByStaffName: string | null;
  }[];
};

// 원장 전용 적립 현황 화면(task.md Phase 3-3, /settings/referral-credits) — 환자를 가로질러
// TRIAL_SIGNUP/MAIN_SIGNUP 적립 전체를 환자별로 묶어 보여준다. 처방상세의 개별 표시(링크
// 1개 기준)와 달리 이건 환자 전체 누적 기준이라 group-by를 JS에서 직접 수행한다 — 이
// 화면의 트래픽/데이터량이 적어 DB 레벨 집계가 필요할 만큼 크지 않다.
export async function listReferralCreditSummary(): Promise<ReferralCreditPatientSummary[]> {
  const entries = await prisma.referralCreditEntry.findMany({
    include: { patient: true, confirmedByStaff: true },
    orderBy: { createdAt: "desc" },
  });

  const byPatient = new Map<number, ReferralCreditPatientSummary>();
  for (const entry of entries) {
    let summary = byPatient.get(entry.patientId);
    if (!summary) {
      summary = {
        patientId: entry.patientId,
        patientName: entry.patient.name,
        chartNumber: entry.patient.chartNumber,
        trialTotal: 0,
        mainTotal: 0,
        total: 0,
        entries: [],
      };
      byPatient.set(entry.patientId, summary);
    }
    if (entry.kind === CREDIT_KIND_TRIAL_SIGNUP) summary.trialTotal += entry.amount;
    else if (entry.kind === CREDIT_KIND_MAIN_SIGNUP) summary.mainTotal += entry.amount;
    summary.total += entry.amount;
    summary.entries.push({
      id: entry.id,
      kind: entry.kind,
      amount: entry.amount,
      referredName: entry.referredName,
      createdAt: entry.createdAt,
      confirmedByStaffName: entry.confirmedByStaff?.name ?? null,
    });
  }

  return [...byPatient.values()].sort((a, b) => b.total - a.total);
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

export type TrialReferralStatus = {
  token: string;
  expiresAt: Date;
  isActive: boolean;
  creditCount: number;
  creditTotalAmount: number;
};

/**
 * 처방 기준 추천링크 현황 조회(task.md Phase 2) — 마감설문 배너(2-1)와 2일차톡 추천링크
 * 삽입(2-2) 양쪽이 공유한다. getPrescriptionDetail(prescriptions.ts)의 기존 referralLink
 * 집계 로직과 동일 원칙(ReferralCreditEntry(TRIAL_SIGNUP)을 linkToken 기준 집계)이지만,
 * 그쪽은 상세페이지 조회 함수 안에 인라인돼 있어 재사용할 수 없어 별도로 둔다.
 */
export async function getTrialReferralStatus(prescriptionId: number): Promise<TrialReferralStatus | null> {
  const link = await prisma.referralLink.findFirst({
    where: { sourcePrescriptionId: prescriptionId, kind: REFERRAL_KIND_TRIAL },
  });
  if (!link) return null;

  const creditAgg = await prisma.referralCreditEntry.aggregate({
    where: { linkToken: link.token, kind: CREDIT_KIND_TRIAL_SIGNUP },
    _count: true,
    _sum: { amount: true },
  });

  return {
    token: link.token,
    expiresAt: link.expiresAt,
    isActive: link.isActive,
    creditCount: creditAgg._count,
    creditTotalAmount: creditAgg._sum.amount ?? 0,
  };
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
