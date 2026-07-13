import { prisma } from "@/lib/db";
import { generateProgramTeachingContent } from "@/lib/ai-message";
import { createWithShortToken } from "@/lib/short-token";
import {
  formatProgramTeachingContent,
  getExamTrend,
  getLatestExamSnapshot,
  isLinkedTestType,
  type LatestExamSnapshot,
  type LinkedTestType,
} from "@/lib/program-teaching";
import { EXAM_TYPE_LABEL, SMI_JUDGEMENT_LABEL, GRIP_JUDGEMENT_LABEL } from "@/lib/examination-format";
import {
  computeGripFourLevel,
  computeSmiFourLevel,
  FOUR_LEVEL_JUDGEMENT_LABEL,
  type Gender,
} from "@/lib/exam-thresholds";
import { logActivity } from "@/lib/activity-log";
import { withObjectParticle } from "@/lib/korean-particle";
import { listConsultationNotesForPatient } from "@/lib/consultation-notes";

// 티칭지에 개별 문구(ProgramTeaching.ctaButtonLabel)가 없을 때 쓰는 기본 전환버튼 문구.
export const DEFAULT_CTA_LABEL = "본상담 예약하기";

export class NeedsExamError extends Error {
  linkedTestType: LinkedTestType;
  constructor(linkedTestType: LinkedTestType) {
    super(
      `이 프로그램은 검사와 연결됩니다. 먼저 ${EXAM_TYPE_LABEL[linkedTestType]} 진행을 권유해주세요.`,
    );
    this.name = "NeedsExamError";
    this.linkedTestType = linkedTestType;
  }
}

function formatTestValueSummary(snapshot: LatestExamSnapshot): string {
  if (snapshot.examType === "BODY_COMPOSITION") {
    const parts = [
      `체중 ${snapshot.weightKg}kg`,
      `체지방율 ${snapshot.bodyFatPercent}%`,
      `WHR ${snapshot.whr}`,
    ];
    if (snapshot.smi != null && snapshot.smiJudgement) {
      parts.push(
        `SMI ${snapshot.smi.toFixed(2)}(${SMI_JUDGEMENT_LABEL[snapshot.smiJudgement] ?? snapshot.smiJudgement})`,
      );
    }
    return parts.join(", ");
  }

  const parts = [
    `악력평균 ${snapshot.gripAvgKg.toFixed(1)}kg(${GRIP_JUDGEMENT_LABEL[snapshot.gripJudgement] ?? snapshot.gripJudgement})`,
  ];
  if (snapshot.estimatedGripAge != null) parts.push(`근력나이 ${snapshot.estimatedGripAge}세`);
  return parts.join(", ");
}

function isGender(value: string | null): value is Gender {
  return value === "MALE" || value === "FEMALE";
}

// AI 프롬프트에 "판정에 따라 톤을 분기하라"고 명시적으로 전달할 4단계(약함/경계/양호/우수)
// 라벨을 서버가 원본 수치로 재계산한다(클라이언트/과거 저장값 불신 원칙, exam-thresholds.ts
// 참고) — /examinations 화면이 쓰는 기존 2/3단계 판정(smiJudgement/gripJudgement 컬럼)과는
// 별개 체계다. 성별 미입력이거나(SMI를 계산 못한 경우) 연령대 표를 벗어나면 null.
function extractFourLevelJudgementLabel(snapshot: LatestExamSnapshot, gender: string | null): string | null {
  if (!isGender(gender)) return null;
  if (snapshot.examType === "BODY_COMPOSITION") {
    if (snapshot.smi == null) return null;
    return FOUR_LEVEL_JUDGEMENT_LABEL[computeSmiFourLevel(gender, snapshot.smi)];
  }
  const level = computeGripFourLevel(gender, snapshot.measuredAge, snapshot.gripAvgKg);
  return level ? FOUR_LEVEL_JUDGEMENT_LABEL[level] : null;
}

export type CreateTeachingPageInput = {
  patientId: number;
  programTeachingId: number;
  createdByStaffId: number;
};

/**
 * linkedTestType이 있는 프로그램은 반드시 최신 검사기록이 있어야 생성할 수 있다 — 검사
 * 이력이 없으면 NeedsExamError를 던져 "먼저 검사를 권유해달라"는 안내로 생성을 중단시킨다
 * (task.md 3항 — 검사 유도 장치로 활용). linkedTestType이 null인 프로그램(추나패키지 등)은
 * 검사수치 없이 바로 진행한다.
 */
export async function createTeachingPage(input: CreateTeachingPageInput) {
  const [patient, program, notes, consultationNotes] = await Promise.all([
    prisma.patient.findUnique({ where: { id: input.patientId } }),
    prisma.programTeaching.findUnique({ where: { id: input.programTeachingId } }),
    prisma.patientNote.findMany({
      where: { patientId: input.patientId },
      orderBy: { createdAt: "desc" },
    }),
    listConsultationNotesForPatient(input.patientId),
  ]);

  if (!patient) throw new Error("환자를 찾을 수 없습니다.");
  if (!program || !program.isActive) throw new Error("프로그램 자료를 찾을 수 없습니다.");

  let snapshot: LatestExamSnapshot | null = null;
  let examTrend: string | null = null;
  if (isLinkedTestType(program.linkedTestType)) {
    snapshot = await getLatestExamSnapshot(input.patientId, program.linkedTestType);
    if (!snapshot) {
      throw new NeedsExamError(program.linkedTestType);
    }
    examTrend = await getExamTrend(input.patientId, program.linkedTestType);
  }

  const hasLinkedExam = isLinkedTestType(program.linkedTestType);
  const testValueSummary = snapshot ? formatTestValueSummary(snapshot) : null;
  const examJudgementLabel = snapshot ? extractFourLevelJudgementLabel(snapshot, patient.gender) : null;
  const { sellingText, academicText } = formatProgramTeachingContent(program);

  // SOAP 변환본(convertedChartText)이 있으면 그쪽이 더 정리된 형태라 우선 사용, 없으면 원문.
  const latestNote = consultationNotes[0];
  const latestConsultationNote = latestNote
    ? {
        typeName: latestNote.consultationType.name,
        text: latestNote.convertedChartText ?? latestNote.rawText,
      }
    : undefined;

  const content = await generateProgramTeachingContent(
    {
      programName: program.programName,
      targetSymptomKeywords: program.targetSymptomKeywords,
      sellingText,
      academicText,
      testValueSummary,
      examJudgementLabel,
      examTrend,
      hasLinkedExam,
    },
    {
      name: patient.name,
      notes: notes.map((n) => ({ content: n.content, createdAt: n.createdAt })),
      coreProfile: {
        pastHistory: patient.pastHistory,
        currentCondition: patient.currentCondition,
        mainNeeds: patient.mainNeeds,
      },
      latestConsultationNote,
    },
  );

  const page = await createWithShortToken((token) =>
    prisma.patientTeachingPage.create({
      data: {
        token,
        patientId: input.patientId,
        programTeachingId: input.programTeachingId,
        snapshotTestValueJson: snapshot ? JSON.stringify(snapshot) : null,
        headline: content.headline,
        personalSubtopic: content.personalSubtopic,
        bodyText: content.bodyText,
        examSummary: content.examSummary,
        academicHook: content.academicHook,
        createdByStaffId: input.createdByStaffId,
      },
      include: { programTeaching: true },
    }),
  );

  return {
    // 공유링크(PatientShareLink.teachingPageId)가 참조하는 내부 PK — 생성 직후 UI가
    // 공유링크 패널의 "새로 만든 티칭지" 드롭다운에 바로 선택 상태로 반영하기 위해 필요.
    id: page.id,
    token: page.token,
    headline: page.headline,
    personalSubtopic: page.personalSubtopic,
    bodyText: page.bodyText,
    examSummary: page.examSummary,
    academicHook: page.academicHook,
    programName: page.programTeaching.programName,
    testValueSummary,
    supportImagePath: page.programTeaching.supportImagePath,
  };
}

export type PublicTeachingPageView = {
  programName: string;
  supportImagePath: string | null;
  headline: string;
  personalSubtopic: string;
  bodyText: string;
  examSummary: string | null;
  academicHook: string;
  testValueSummary: string | null;
  viewCount: number;
  ctaButtonLabel: string;
};

/**
 * 공개 페이지(/p/{token}) 전용 조회 — 화이트리스트 변환(patient-view.ts와 동일 원칙,
 * 측정자/staffId/원본 메모 등 내부 정보는 반환 타입 자체에 아예 없음).
 * 접속마다 viewCount +1, 최초 접속이면 firstViewedAt만 1회 기록한다.
 */
export async function getPublicTeachingPageByToken(
  token: string,
): Promise<PublicTeachingPageView | null> {
  const existing = await prisma.patientTeachingPage.findUnique({ where: { token } });
  if (!existing) return null;

  const updated = await prisma.patientTeachingPage.update({
    where: { id: existing.id },
    data: {
      viewCount: { increment: 1 },
      firstViewedAt: existing.firstViewedAt ?? new Date(),
    },
    include: { programTeaching: true },
  });

  let testValueSummary: string | null = null;
  if (updated.snapshotTestValueJson) {
    try {
      const parsed = JSON.parse(updated.snapshotTestValueJson) as LatestExamSnapshot;
      testValueSummary = formatTestValueSummary(parsed);
    } catch {
      testValueSummary = null;
    }
  }

  return {
    programName: updated.programTeaching.programName,
    supportImagePath: updated.programTeaching.supportImagePath,
    headline: updated.headline,
    personalSubtopic: updated.personalSubtopic,
    bodyText: updated.bodyText,
    examSummary: updated.examSummary,
    academicHook: updated.academicHook,
    testValueSummary,
    viewCount: updated.viewCount,
    ctaButtonLabel: updated.programTeaching.ctaButtonLabel ?? DEFAULT_CTA_LABEL,
  };
}

export type PatientTeachingPageSummary = {
  id: number;
  token: string;
  programName: string;
  createdAt: string;
};

// 공유링크 패널(14-11)의 "기존 저장된 티칭지" 드롭다운용 — 환자에게 이미 생성된 티칭지를
// 전부 나열한다(유실버그 대응: 생성 직후 UI를 벗어나 링크를 놓쳤어도 여기서 다시 찾을 수 있음).
// 소프트삭제(isActive=false)된 티칭지는 목록/드롭다운에서 제외한다(task.md 지시) — 이미
// 발송된 공개 링크는 별개로 계속 살아있는다(getPublicTeachingPageByToken/
// getTeachingPageContentById는 isActive를 보지 않음).
export async function listPatientTeachingPages(patientId: number): Promise<PatientTeachingPageSummary[]> {
  const pages = await prisma.patientTeachingPage.findMany({
    where: { patientId, isActive: true },
    include: { programTeaching: true },
    orderBy: { createdAt: "desc" },
  });
  return pages.map((p) => ({
    id: p.id,
    token: p.token,
    programName: p.programTeaching.programName,
    createdAt: p.createdAt.toISOString(),
  }));
}

// 소프트삭제(task.md) — 완전삭제 대신 isActive만 내려서, 이미 발송된 /p/[token]·/s/[token]
// 링크는 계속 정상 렌더링되게 하면서 생성 화면 목록/드롭다운에서만 제외한다.
export async function softDeleteTeachingPage(token: string) {
  return prisma.patientTeachingPage.update({
    where: { token },
    data: { isActive: false },
  });
}

export type TeachingPageContentForShare = {
  // 기존 /p/{token} 단독 링크와 CTA클릭 로그(POST /api/teaching-pages/{token}/cta-click)를
  // 그대로 재사용하기 위해 원래 token도 함께 내려준다.
  token: string;
  programName: string;
  supportImagePath: string | null;
  headline: string;
  personalSubtopic: string;
  bodyText: string;
  examSummary: string | null;
  academicHook: string;
  testValueSummary: string | null;
  ctaButtonLabel: string;
};

// 통합 공유링크(/s/{token}) 전용 조회 — PatientShareLink.teachingPageId(내부 PK)로 조회한다.
// 조회수는 PatientTeachingPage 자신이 아니라 PatientShareLink 쪽에서 세므로(share-links.ts)
// 여기서는 viewCount를 증가시키지 않는다(동일 티칭지에 /p/와 /s/ 링크가 둘 다 있을 때
// 이중 집계 방지).
export async function getTeachingPageContentById(id: number): Promise<TeachingPageContentForShare | null> {
  const page = await prisma.patientTeachingPage.findUnique({
    where: { id },
    include: { programTeaching: true },
  });
  if (!page) return null;

  let testValueSummary: string | null = null;
  if (page.snapshotTestValueJson) {
    try {
      const parsed = JSON.parse(page.snapshotTestValueJson) as LatestExamSnapshot;
      testValueSummary = formatTestValueSummary(parsed);
    } catch {
      testValueSummary = null;
    }
  }

  return {
    token: page.token,
    programName: page.programTeaching.programName,
    supportImagePath: page.programTeaching.supportImagePath,
    headline: page.headline,
    personalSubtopic: page.personalSubtopic,
    bodyText: page.bodyText,
    examSummary: page.examSummary,
    academicHook: page.academicHook,
    testValueSummary,
    ctaButtonLabel: page.programTeaching.ctaButtonLabel ?? DEFAULT_CTA_LABEL,
  };
}

export type TeachingPageContentUpdateInput = {
  headline: string;
  personalSubtopic: string;
  bodyText: string;
  // undefined면 그대로 두고, examSummary가 원래 null이던 레코드는 값이 와도 계속 null로
  // 고정한다(검사 무관 프로그램에 검사요약이 생기는 걸 막기 위함 — task.md 지시).
  examSummary?: string;
  academicHook: string;
};

/**
 * 티칭지 5필드 수작업 편집 — 생성 직후 화면의 "수정" 버튼에서만 호출된다. 별도 수정 이력을
 * 남기지 않고 현재 상태를 그대로 덮어쓴다(ConsultationNote와 달리 진료기록이 아니라 단순
 * 마케팅 카피이기 때문 — task.md 지시).
 */
export async function updateTeachingPageContent(token: string, input: TeachingPageContentUpdateInput) {
  const existing = await prisma.patientTeachingPage.findUniqueOrThrow({ where: { token } });
  return prisma.patientTeachingPage.update({
    where: { token },
    data: {
      headline: input.headline,
      personalSubtopic: input.personalSubtopic,
      bodyText: input.bodyText,
      examSummary: existing.examSummary === null ? null : (input.examSummary ?? existing.examSummary),
      academicHook: input.academicHook,
    },
  });
}

/**
 * 공개 티칭지 전환버튼 클릭 기록 — 인증 없이(/p/{token}에서 직접) 호출되는 공개 엔드포인트다.
 * 중복 클릭 방지는 하지 않는다(task.md 지시) — 여러 번 눌러도 각각 별도 로그로 남는다.
 */
export async function recordTeachingPageCtaClick(token: string): Promise<boolean> {
  const page = await prisma.patientTeachingPage.findUnique({
    where: { token },
    include: { patient: true, programTeaching: true },
  });
  if (!page) return false;

  const ctaLabel = page.programTeaching.ctaButtonLabel ?? DEFAULT_CTA_LABEL;
  await logActivity({
    actorType: "PATIENT",
    actorId: page.patientId,
    actionType: "TEACHING_CTA_CLICK",
    label: `${page.patient.name}님이 [${page.programTeaching.programName}] ${withObjectParticle(ctaLabel)} 눌렀습니다`,
  });
  return true;
}
