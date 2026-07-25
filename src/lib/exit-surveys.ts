import { prisma } from "@/lib/db";
import { getTrialReferralStatus, type TrialReferralStatus } from "@/lib/referrals";
import { getMainReferralAmounts } from "@/lib/trial-campaign";
import { startOfDay, getSystemStaffUserId } from "@/lib/teaching-pages";
import { createWorkTask } from "@/lib/work-tasks";
import { WORK_TASK_TYPE } from "@/lib/task-types";
import {
  COMPLIANCE_OPTIONS,
  CONSULT_INTEREST_OPTIONS,
  type ComplianceValue,
  type ConsultInterestValue,
} from "@/lib/exit-survey-format";

export type ExitSurveyPageData = {
  patientName: string;
  alreadySubmitted: boolean;
  referralStatus: TrialReferralStatus | null;
  // 본프로그램 추천 적립금 차등화(task.md) — 마감설문 완료 화면에서 "친구를 소개하면
  // 본프로그램 등록 시 이만큼 할인된다"는 안내에 쓴다. 어느 프로그램으로 등록할지 아직
  // 모르는 시점이라 1개월/3개월 두 값 다 내려준다(설정 가능값, getMainReferralAmounts).
  mainRefereeDiscounts: { oneMonth: number; threeMonth: number };
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

  return {
    patientName: prescription.patient.name,
    alreadySubmitted: Boolean(prescription.exitSurveyResponse),
    referralStatus,
    mainRefereeDiscounts: { oneMonth: oneMonth.refereeAmount, threeMonth: threeMonth.refereeAmount },
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

  if (input.consultInterest === "네" || input.consultInterest === "고민중") {
    await requestExitSurveyConsultCallback(input.prescriptionId, prescription.patientId, prescription.patient.name);
  }

  return response;
}
