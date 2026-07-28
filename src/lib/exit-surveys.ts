import { prisma } from "@/lib/db";
import { getTrialReferralStatus, type TrialReferralStatus } from "@/lib/referrals";
import { getMainReferralAmounts, getExitSurveyCompletionAmount } from "@/lib/trial-campaign";
import { computeReferralCreditExpiry } from "@/lib/referral-config";
import { startOfDay, getSystemStaffUserId } from "@/lib/teaching-pages";
import { createWorkTask } from "@/lib/work-tasks";
import { WORK_TASK_TYPE } from "@/lib/task-types";
import {
  COMPLIANCE_OPTIONS,
  CONSULT_INTEREST_OPTIONS,
  parseChanges,
  type ComplianceValue,
  type ConsultInterestValue,
} from "@/lib/exit-survey-format";

const CREDIT_KIND_EXIT_SURVEY_COMPLETION = "EXIT_SURVEY_COMPLETION";
const CREDIT_STATUS_CONFIRMED = "CONFIRMED";

export type ExitSurveyPageData = {
  patientName: string;
  alreadySubmitted: boolean;
  referralStatus: TrialReferralStatus | null;
  // 본프로그램 추천 적립금 차등화(task.md) — 마감설문 완료 화면에서 "친구를 소개하면
  // 본프로그램 등록 시 이만큼 할인된다"는 안내에 쓴다. 어느 프로그램으로 등록할지 아직
  // 모르는 시점이라 1개월/3개월 두 값 다 내려준다(설정 가능값, getMainReferralAmounts).
  mainRefereeDiscounts: { oneMonth: number; threeMonth: number };
  // 마감설문 작성 완료 적립금(task2.md) — 이미 제출된 처방이면 실제 지급된 금액(이 지시서
  // 반영 이전 제출건은 지급된 적이 없어 null), 아직 미제출이면 지금 제출 시 지급될 현재
  // 설정값을 미리 내려준다(완료 화면이 별도 재조회 없이 그대로 쓴다).
  exitSurveyCreditAmount: number | null;
};

// 공개 마감설문 페이지(/refer/exit/[prescriptionId], task.md Phase 2-1) 조회 — 인증 없음,
// prescriptionId를 그대로 URL에 노출한다(3일차 마감톡 링크로만 전달되는 값이라 이 범위에서는
// 별도 토큰 발급 없이 task.md 지시 그대로 진행).
export async function getExitSurveyPageData(prescriptionId: number): Promise<ExitSurveyPageData | null> {
  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: { patient: true, exitSurveyResponse: true },
  });
  if (!prescription) return null;

  const [referralStatus, oneMonth, threeMonth] = await Promise.all([
    getTrialReferralStatus(prescriptionId),
    getMainReferralAmounts("ONE_MONTH"),
    getMainReferralAmounts("THREE_MONTH"),
  ]);

  let exitSurveyCreditAmount: number | null;
  if (prescription.exitSurveyResponse) {
    const existingCredit = await prisma.referralCreditEntry.findFirst({
      where: { referredPrescriptionId: prescriptionId, kind: CREDIT_KIND_EXIT_SURVEY_COMPLETION },
    });
    exitSurveyCreditAmount = existingCredit?.amount ?? null;
  } else {
    exitSurveyCreditAmount = await getExitSurveyCompletionAmount();
  }

  return {
    patientName: prescription.patient.name,
    alreadySubmitted: Boolean(prescription.exitSurveyResponse),
    referralStatus,
    mainRefereeDiscounts: { oneMonth: oneMonth.refereeAmount, threeMonth: threeMonth.refereeAmount },
    exitSurveyCreditAmount,
  };
}

export class ExitSurveyAlreadySubmittedError extends Error {
  constructor() {
    super("이미 제출된 설문입니다.");
    this.name = "ExitSurveyAlreadySubmittedError";
  }
}

export class InvalidExitSurveyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidExitSurveyInputError";
  }
}

export type ExitSurveyInput = {
  prescriptionId: number;
  compliance: ComplianceValue;
  changes: string[];
  consultInterest: ConsultInterestValue;
  comment?: string;
};

/**
 * "본상담 예약 요청" 콜백 업무(task.md Phase 2-1) — requestConsultCallback(teaching-pages.ts)/
 * requestTrialApplicationCallback(referrals.ts)과 동일한 패턴(전체공통 WORK, 당일+동일환자+
 * 미완료 중복방지).
 */
async function requestExitSurveyConsultCallback(
  prescriptionId: number,
  patientId: number,
  patientName: string,
): Promise<void> {
  const existingOpen = await prisma.todoTask.findFirst({
    where: {
      taskType: WORK_TASK_TYPE,
      patientId,
      isDone: false,
      createdAt: { gte: startOfDay(new Date()) },
      workTask: { title: { contains: "본상담 예약 요청" } },
    },
  });
  if (existingOpen) return;

  const systemStaffId = await getSystemStaffUserId();
  await createWorkTask({
    title: `${patientName}님 본상담 예약 요청 — 연락 필요`,
    description: `마감설문 제출(처방 #${prescriptionId})`,
    creatorId: systemStaffId,
    isSharedTask: true,
    dueDate: null,
    patientId,
  });
}

export async function createExitSurveyResponse(input: ExitSurveyInput) {
  if (!(COMPLIANCE_OPTIONS as readonly string[]).includes(input.compliance)) {
    throw new InvalidExitSurveyInputError("복용여부를 선택해주세요.");
  }
  if (input.changes.length === 0) {
    throw new InvalidExitSurveyInputError("변화를 하나 이상 선택해주세요.");
  }
  if (!(CONSULT_INTEREST_OPTIONS as readonly string[]).includes(input.consultInterest)) {
    throw new InvalidExitSurveyInputError("상담희망 여부를 선택해주세요.");
  }

  const prescription = await prisma.prescription.findUnique({
    where: { id: input.prescriptionId },
    include: { patient: true, exitSurveyResponse: true },
  });
  if (!prescription) throw new InvalidExitSurveyInputError("처방을 찾을 수 없습니다.");
  if (prescription.exitSurveyResponse) throw new ExitSurveyAlreadySubmittedError();

  const response = await prisma.exitSurveyResponse.create({
    data: {
      prescriptionId: input.prescriptionId,
      compliance: input.compliance,
      changes: JSON.stringify(input.changes),
      consultInterest: input.consultInterest,
      comment: input.comment?.trim() || null,
    },
  });

  // 마감설문 작성 완료 적립금(task2.md) — 이 지시서 반영 이후 신규 제출건부터만 지급.
  // 같은 처방으로 중복 제출될 수 없으므로(위 exitSurveyResponse 존재 체크) 원칙적으로
  // 한 번만 지급되지만, 방어적으로 한 번 더 존재 여부를 확인한다(idempotent).
  const existingCredit = await prisma.referralCreditEntry.findFirst({
    where: { referredPrescriptionId: input.prescriptionId, kind: CREDIT_KIND_EXIT_SURVEY_COMPLETION },
  });
  if (!existingCredit) {
    const amount = await getExitSurveyCompletionAmount();
    const now = new Date();
    await prisma.referralCreditEntry.create({
      data: {
        patientId: prescription.patientId,
        linkToken: `EXIT_SURVEY_${input.prescriptionId}`,
        kind: CREDIT_KIND_EXIT_SURVEY_COMPLETION,
        amount,
        referredName: "마감설문 작성 완료",
        referredPrescriptionId: input.prescriptionId,
        status: CREDIT_STATUS_CONFIRMED,
        expiresAt: computeReferralCreditExpiry(now),
      },
    });
  }

  if (input.consultInterest === "네" || input.consultInterest === "고민중") {
    await requestExitSurveyConsultCallback(input.prescriptionId, prescription.patientId, prescription.patient.name);
  }

  return response;
}

export type ExitSurveyResponseRow = {
  id: number;
  prescriptionId: number;
  patientId: number;
  patientName: string;
  chartNumber: string;
  programName: string;
  compliance: string;
  changes: string[];
  consultInterest: string;
  comment: string | null;
  submittedAt: Date;
  workTask: { id: number; isDone: boolean; doneAt: Date | null } | null;
};

/**
 * 마감설문 응답 전체보기(task.md, /refer/exit-responses) — /refer/applications(신청응답
 * 전체보기)와 동일한 "직원용 목록 조회" 패턴. 연동된 "본상담 예약 요청" 콜백 업무는
 * requestExitSurveyConsultCallback이 별도 FK 없이 title+당일+환자로만 dedup하므로, 여기서는
 * WorkTask.description에 박아둔 "(처방 #N)" 문자열로 역매칭한다(상담희망=아니오는 애초에
 * 업무 자체가 생성되지 않으므로 null).
 */
export async function listAllExitSurveyResponses(): Promise<ExitSurveyResponseRow[]> {
  const responses = await prisma.exitSurveyResponse.findMany({
    orderBy: { submittedAt: "desc" },
    include: { prescription: { include: { patient: true, program: true } } },
  });

  const consultWorkTasks = await prisma.todoTask.findMany({
    where: { taskType: WORK_TASK_TYPE, workTask: { title: { contains: "본상담 예약 요청" } } },
    include: { workTask: true },
  });
  const workTaskByPrescriptionId = new Map<number, { id: number; isDone: boolean; doneAt: Date | null }>();
  for (const t of consultWorkTasks) {
    const match = t.workTask?.description?.match(/처방 #(\d+)\)/);
    if (match) workTaskByPrescriptionId.set(Number(match[1]), { id: t.id, isDone: t.isDone, doneAt: t.doneAt });
  }

  return responses.map((r) => ({
    id: r.id,
    prescriptionId: r.prescriptionId,
    patientId: r.prescription.patientId,
    patientName: r.prescription.patient.name,
    chartNumber: r.prescription.patient.chartNumber,
    programName: r.prescription.program.name,
    compliance: r.compliance,
    changes: parseChanges(r.changes),
    consultInterest: r.consultInterest,
    comment: r.comment,
    submittedAt: r.submittedAt,
    workTask: workTaskByPrescriptionId.get(r.prescriptionId) ?? null,
  }));
}
