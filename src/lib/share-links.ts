import { prisma } from "@/lib/db";
import { getTeachingPageContentById, type TeachingPageContentForShare } from "@/lib/teaching-pages";
import { getEventImage } from "@/lib/event-images";
import { createWithShortToken } from "@/lib/short-token";
import {
  getBodyCompositionRecord,
  getStrengthTestRecord,
  ensureBodyCompositionExplanation,
  ensureStrengthTestExplanation,
} from "@/lib/examinations";
import { getHrvTestRecord, ensureHrvExplanation } from "@/lib/hrv";
import {
  toPatientSafeExamView,
  toPatientSafeHrvView,
  type PatientSafeExamView,
  type PatientSafeHrvView,
} from "@/lib/patient-view";
import { getLatestChecklistResponse } from "@/lib/tcm-checklist";

export type ShareLinkExamRecordInput = { examType: string; examRecordId: number };

export type CreateShareLinkInput = {
  patientId: number;
  teachingPageId: number | null;
  eventImageId: number | null;
  // 검사톡(task.md) — 0개 이상, teachingPageId/eventImageId와 독립적으로 조합 가능.
  examRecords: ShareLinkExamRecordInput[];
  createdByStaffId: number;
};

export class InvalidShareLinkComboError extends Error {
  constructor() {
    super("프로그램티칭, 이벤트, 검사결과 중 최소 하나는 선택해야 합니다.");
    this.name = "InvalidShareLinkComboError";
  }
}

// examRecords 배열을 순서 무관하게 비교하기 위한 정규화 키.
function examSetKey(records: { examType: string; examRecordId: number }[]): string {
  return records
    .map((r) => `${r.examType}:${r.examRecordId}`)
    .sort()
    .join("|");
}

/**
 * 이미 동일 조합(환자+티칭지+이벤트+검사기록 집합)의 링크가 있으면 그대로 재사용하고, 없으면
 * 새로 생성한다(task.md — 중복 생성 방지). teachingPageId/eventImageId/examRecords 셋 다
 * 비어있으면 애초에 링크가 필요 없는 케이스이므로 서버단에서 막는다.
 * 검사기록 집합까지 같아야 재사용 대상이라, teaching/event로 후보를 먼저 좁힌 뒤 JS에서
 * examLinks 집합을 비교한다(배열 필드라 Prisma where로 직접 비교 불가).
 */
export async function createOrReuseShareLink(input: CreateShareLinkInput) {
  const examRecords = input.examRecords ?? [];
  if (input.teachingPageId === null && input.eventImageId === null && examRecords.length === 0) {
    throw new InvalidShareLinkComboError();
  }

  const candidates = await prisma.patientShareLink.findMany({
    where: {
      patientId: input.patientId,
      teachingPageId: input.teachingPageId,
      eventImageId: input.eventImageId,
    },
    include: { examLinks: true },
  });

  const wantedKey = examSetKey(examRecords);
  const existing = candidates.find((c) => examSetKey(c.examLinks) === wantedKey);
  if (existing) return existing;

  return createWithShortToken((token) =>
    prisma.patientShareLink.create({
      data: {
        token,
        patientId: input.patientId,
        teachingPageId: input.teachingPageId,
        eventImageId: input.eventImageId,
        createdByStaffId: input.createdByStaffId,
        examLinks: {
          create: examRecords.map((r) => ({ examType: r.examType, examRecordId: r.examRecordId })),
        },
      },
      include: { examLinks: true },
    }),
  );
}

export type ShareLinkEventView = {
  finalTitle: string;
  compositeImagePath: string;
  // 카톡 발송용 본문 전체(줄바꿈 포함) — task.md 지시로 /s/[token] 이벤트 섹션에서
  // 이미지 아래 일반 텍스트로 그대로 노출한다.
  finalCopy: string;
};

// 검사톡(task.md) 섹션 1건 — 기존 "환자와함께보기" 화이트리스트 변환(toPatientSafeExamView/
// toPatientSafeHrvView)을 그대로 재사용해서 조립한다. HRV만 examType이 원본 타입에 없어
// 여기서 직접 덧붙인다.
export type ShareLinkExamEntry =
  | ({ id: number } & PatientSafeExamView)
  | ({ id: number; examType: "HRV" } & PatientSafeHrvView);

// 상담설문(task.md) 4번째 섹션 — 자동 노출, 단 응답이 1건 이상 있을 때만(task2.md 결정사항
// 2). candidateLabels가 비어있으면 "특이 증상 확인되지 않음"으로 표시(0점/후보없음, 이 화면
// 상태는 정상 케이스이지 오류가 아니다). 환자 화면이라 ratio 숫자는 절대 넘기지 않고 3단계
// 라벨(tierLabel)만 내려준다.
export type ShareLinkConsultationSurveyView = {
  updatedAt: string;
  candidateLabels: string[];
  tiers: { patientLabel: string; tierLabel: "낮음" | "보통" | "뚜렷함" }[];
};

export type PublicShareLinkView = {
  teaching: TeachingPageContentForShare | null;
  event: ShareLinkEventView | null;
  exams: ShareLinkExamEntry[];
  consultationSurvey: ShareLinkConsultationSurveyView | null;
  viewCount: number;
};

// 검사기록 1건을 환자용 화이트리스트 뷰로 변환 — 소프트삭제됐거나(isActive:false) 원본이
// 사라진 경우 null(링크 자체는 살아있어도 그 섹션만 조용히 빠진다, aiExplanation 캐싱 없는
// 과거 레코드는 이 시점에 즉석 생성해서 채운다(기존 patient-view 화면과 동일 원칙).
async function buildExamEntry(link: { examType: string; examRecordId: number }): Promise<ShareLinkExamEntry | null> {
  if (link.examType === "BODY_COMPOSITION") {
    const record = await getBodyCompositionRecord(link.examRecordId);
    if (!record || !record.isActive) return null;
    const aiExplanation = record.aiExplanation ?? (await ensureBodyCompositionExplanation(record.id));
    const safe = toPatientSafeExamView({
      examType: "BODY_COMPOSITION",
      examDate: record.examDate.toISOString(),
      weightKg: record.weightKg,
      bodyFatPercent: record.bodyFatPercent,
      whr: record.whr,
      smi: record.smi,
      smiJudgement: record.smiJudgement as "NORMAL" | "SARCOPENIA" | null,
      patient: { height: record.patient.height },
      aiExplanation,
    });
    return { id: record.id, ...safe };
  }

  if (link.examType === "STRENGTH_TEST") {
    const record = await getStrengthTestRecord(link.examRecordId);
    if (!record || !record.isActive) return null;
    const aiExplanation = record.aiExplanation ?? (await ensureStrengthTestExplanation(record.id));
    const safe = toPatientSafeExamView({
      examType: "STRENGTH_TEST",
      examDate: record.examDate.toISOString(),
      gripLeftKg: record.gripLeftKg,
      gripRightKg: record.gripRightKg,
      gripAvgKg: record.gripAvgKg,
      gripJudgement: record.gripJudgement as "WEAK" | "NORMAL" | "STRONG" | "UNKNOWN",
      estimatedGripAge: record.estimatedGripAge,
      gripAgeOutOfRange: record.gripAgeOutOfRange as "young" | "old" | null,
      aiExplanation,
    });
    return { id: record.id, ...safe };
  }

  if (link.examType === "HRV") {
    const record = await getHrvTestRecord(link.examRecordId);
    if (!record || !record.isActive) return null;
    // ensureHrvExplanation은 aiDeviceReading이 비어있고 레거시 aiCommentary도 없을 때만
    // 실제로 생성한다(hrv.ts 기존 원칙 그대로) — 그 외에는 record에 이미 있는 값을 쓴다.
    const sections =
      !record.aiDeviceReading && !record.aiCommentary ? await ensureHrvExplanation(record.id) : null;
    const safe = toPatientSafeHrvView({
      testDate: record.testDate.toISOString(),
      vascularHealthIndex: record.vascularHealthIndex,
      vascularHealthType: record.vascularHealthType,
      avgPulse: record.avgPulse,
      stressIndex: record.stressIndex,
      sourceImagePath: record.sourceImagePath,
      sourceImagePath2: record.sourceImagePath2,
      aiCommentary: record.aiCommentary,
      aiDeviceReading: sections?.deviceReading ?? record.aiDeviceReading,
      aiClinicalMeaning: sections?.clinicalMeaning ?? record.aiClinicalMeaning,
      aiLifestyleGuide: sections?.lifestyleGuide ?? record.aiLifestyleGuide,
      aiTcmInterpretation: sections?.tcmInterpretation ?? record.aiTcmInterpretation,
    });
    return { id: record.id, examType: "HRV" as const, ...safe };
  }

  // 알 수 없는 examType(향후 검사 종류 추가 전 과도기 등) — 조용히 스킵.
  return null;
}

/**
 * 공개 페이지(/s/{token}) 전용 조회 — 접속마다 PatientShareLink.viewCount +1, 최초
 * 접속이면 firstViewedAt만 1회 기록한다(getPublicTeachingPageByToken과 동일 패턴).
 */
export async function getShareLinkByToken(token: string): Promise<PublicShareLinkView | null> {
  const existing = await prisma.patientShareLink.findUnique({ where: { token }, include: { examLinks: true } });
  if (!existing) return null;

  const updated = await prisma.patientShareLink.update({
    where: { id: existing.id },
    data: {
      viewCount: { increment: 1 },
      firstViewedAt: existing.firstViewedAt ?? new Date(),
    },
  });

  const [teaching, event, examEntries, checklistResponse] = await Promise.all([
    updated.teachingPageId ? getTeachingPageContentById(updated.teachingPageId) : null,
    updated.eventImageId ? getEventImage(updated.eventImageId) : null,
    Promise.all(existing.examLinks.map(buildExamEntry)),
    getLatestChecklistResponse(updated.patientId),
  ]);

  const consultationSurvey: ShareLinkConsultationSurveyView | null = checklistResponse
    ? {
        updatedAt: checklistResponse.updatedAt.toISOString(),
        candidateLabels: checklistResponse.categoryScores.filter((s) => s.isCandidate).map((s) => s.patientLabel),
        tiers: checklistResponse.categoryScores.map((s) => ({ patientLabel: s.patientLabel, tierLabel: s.tierLabel })),
      }
    : null;

  return {
    teaching,
    consultationSurvey,
    event: event
      ? { finalTitle: event.finalTitle, compositeImagePath: event.compositeImagePath, finalCopy: event.finalCopy }
      : null,
    exams: examEntries.filter((e): e is ShareLinkExamEntry => e !== null),
    viewCount: updated.viewCount,
  };
}
