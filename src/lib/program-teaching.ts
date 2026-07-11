import { prisma } from "@/lib/db";

export const LINKED_TEST_TYPES = ["BODY_COMPOSITION", "STRENGTH_TEST"] as const;
export type LinkedTestType = (typeof LINKED_TEST_TYPES)[number];

export function isLinkedTestType(value: unknown): value is LinkedTestType {
  return LINKED_TEST_TYPES.includes(value as LinkedTestType);
}

// 직원이 채우는 셀링포인트 3개(환자/한의원/기타 관점) — 카테고리별 라벨은 UI/AI
// 프롬프트가 공유한다. 기존 7개(접근성/편의성/차별성/효과체감/안전성/생활적합성/기타)를
// AI로 재분류해 이 구조로 통합했다(2026-07-11).
export const SELLING_FIELD_KEYS = [
  "patientSellingPoints",
  "clinicSellingPoints",
  "etcSellingPoints",
] as const;
export type SellingFieldKey = (typeof SELLING_FIELD_KEYS)[number];

export const SELLING_FIELD_LABEL: Record<SellingFieldKey, string> = {
  patientSellingPoints: "환자 셀링포인트",
  clinicSellingPoints: "한의원 셀링포인트",
  etcSellingPoints: "기타",
};

// 원장이 채우는 학술 3개.
export const ACADEMIC_FIELD_KEYS = [
  "academicDefinition",
  "academicMechanism",
  "academicEvidence",
] as const;
export type AcademicFieldKey = (typeof ACADEMIC_FIELD_KEYS)[number];

export const ACADEMIC_FIELD_LABEL: Record<AcademicFieldKey, string> = {
  academicDefinition: "질환 정의",
  academicMechanism: "처방 기전",
  academicEvidence: "임상 근거",
};

export type ProgramTeachingContentFields = Record<SellingFieldKey | AcademicFieldKey, string | null>;

export async function listProgramTeachings() {
  return prisma.programTeaching.findMany({ orderBy: { id: "desc" } });
}

export async function listActiveProgramTeachings() {
  return prisma.programTeaching.findMany({
    where: { isActive: true },
    orderBy: { programName: "asc" },
  });
}

export async function getProgramTeaching(id: number) {
  return prisma.programTeaching.findUnique({ where: { id } });
}

export async function createProgramTeaching(
  input: {
    programName: string;
    targetSymptomKeywords: string | null;
    linkedTestType: LinkedTestType | null;
    supportImagePath: string | null;
    ctaButtonLabel?: string | null;
  } & Partial<ProgramTeachingContentFields>,
) {
  return prisma.programTeaching.create({ data: input });
}

export async function updateProgramTeaching(
  id: number,
  input: Partial<
    {
      programName: string;
      targetSymptomKeywords: string | null;
      linkedTestType: LinkedTestType | null;
      supportImagePath: string | null;
      ctaButtonLabel: string | null;
      isActive: boolean;
    } & ProgramTeachingContentFields
  >,
) {
  return prisma.programTeaching.update({ where: { id }, data: input });
}

// FormData에서 10개 셀링/학술 필드 중 "보낸" 것만 뽑아낸다 — POST(생성)에서는 전부 보내고,
// PATCH(수정)에서는 보낸 필드만 변경(안 보낸 필드는 기존 값 유지)하는 방식 양쪽에서 공용.
export function readContentFieldsFromFormData(
  formData: FormData,
): Partial<ProgramTeachingContentFields> {
  const result: Partial<ProgramTeachingContentFields> = {};
  for (const key of [...SELLING_FIELD_KEYS, ...ACADEMIC_FIELD_KEYS]) {
    const raw = formData.get(key);
    if (typeof raw === "string") {
      result[key] = raw.trim() || null;
    }
  }
  return result;
}

// 관리 목록 화면의 "셀링 X/7, 학술 Y/3 작성됨" 표시용.
export function countFilledFields(program: ProgramTeachingContentFields): {
  sellingFilled: number;
  academicFilled: number;
} {
  const sellingFilled = SELLING_FIELD_KEYS.filter((k) => program[k]).length;
  const academicFilled = ACADEMIC_FIELD_KEYS.filter((k) => program[k]).length;
  return { sellingFilled, academicFilled };
}

export type ProgramTeachingContentSummary = {
  sellingText: string;
  academicText: string;
};

// AI 프롬프트용 — 채워진 필드만 "라벨: 내용" 줄로 정리한다(빈 카테고리는 생략).
export function formatProgramTeachingContent(
  program: ProgramTeachingContentFields,
): ProgramTeachingContentSummary {
  const sellingLines = SELLING_FIELD_KEYS.filter((k) => program[k]).map(
    (k) => `- ${SELLING_FIELD_LABEL[k]}: ${program[k]}`,
  );
  const academicLines = ACADEMIC_FIELD_KEYS.filter((k) => program[k]).map(
    (k) => `- ${ACADEMIC_FIELD_LABEL[k]}: ${program[k]}`,
  );
  return {
    sellingText: sellingLines.length > 0 ? sellingLines.join("\n") : "없음",
    academicText: academicLines.length > 0 ? academicLines.join("\n") : "없음",
  };
}

export type LatestExamSnapshot =
  | {
      examType: "BODY_COMPOSITION";
      examDate: string;
      weightKg: number;
      bodyFatPercent: number;
      whr: number;
      smi: number | null;
      smiJudgement: string | null;
    }
  | {
      examType: "STRENGTH_TEST";
      examDate: string;
      gripAvgKg: number;
      gripJudgement: string;
      // 측정 시점 나이 스냅샷 — 4단계 판정 재계산(computeGripFourLevel)의 연령대 조회용.
      measuredAge: number;
      estimatedGripAge: number | null;
      gripAgeOutOfRange: string | null;
    };

// 프로그램 티칭지 생성 시 검사수치 스냅샷용 — 환자의 가장 최근 검사기록 1건만 조회한다.
// 검사 이력이 없으면 null(호출측에서 "검사 유도 안내"로 생성을 중단시키는 근거로 사용).
export async function getLatestExamSnapshot(
  patientId: number,
  linkedTestType: LinkedTestType,
): Promise<LatestExamSnapshot | null> {
  if (linkedTestType === "BODY_COMPOSITION") {
    const record = await prisma.bodyCompositionRecord.findFirst({
      where: { patientId },
      orderBy: { examDate: "desc" },
    });
    if (!record) return null;
    return {
      examType: "BODY_COMPOSITION",
      examDate: record.examDate.toISOString(),
      weightKg: record.weightKg,
      bodyFatPercent: record.bodyFatPercent,
      whr: record.whr,
      smi: record.smi,
      smiJudgement: record.smiJudgement,
    };
  }

  const record = await prisma.strengthTestRecord.findFirst({
    where: { patientId },
    orderBy: { examDate: "desc" },
  });
  if (!record) return null;
  return {
    examType: "STRENGTH_TEST",
    examDate: record.examDate.toISOString(),
    gripAvgKg: record.gripAvgKg,
    gripJudgement: record.gripJudgement,
    measuredAge: record.measuredAge,
    estimatedGripAge: record.estimatedGripAge,
    gripAgeOutOfRange: record.gripAgeOutOfRange,
  };
}

function formatSignedDiff(diff: number): string {
  const rounded = Math.round(diff * 10) / 10;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

/**
 * 같은 환자·같은 검사종류의 최근 2건을 비교한 변화량 요약(티칭지 AI 프롬프트용) —
 * 기록이 1건뿐이면(비교 대상 없음) null을 반환해 호출측이 기존처럼 단일값만 쓰게 한다.
 * 변화가 정확히 0이면(의미 없음) 역시 null.
 */
export async function getExamTrend(
  patientId: number,
  linkedTestType: LinkedTestType,
): Promise<string | null> {
  if (linkedTestType === "BODY_COMPOSITION") {
    const records = await prisma.bodyCompositionRecord.findMany({
      where: { patientId },
      orderBy: { examDate: "desc" },
      take: 2,
    });
    if (records.length < 2) return null;
    const [latest, previous] = records;
    const diff = latest.weightKg - previous.weightKg;
    if (diff === 0) return null;
    return `체중 ${formatSignedDiff(diff)}kg 변화(직전 ${previous.weightKg}kg → 최근 ${latest.weightKg}kg)`;
  }

  const records = await prisma.strengthTestRecord.findMany({
    where: { patientId },
    orderBy: { examDate: "desc" },
    take: 2,
  });
  if (records.length < 2) return null;
  const [latest, previous] = records;
  const diff = latest.gripAvgKg - previous.gripAvgKg;
  if (diff === 0) return null;
  return `악력평균 ${formatSignedDiff(diff)}kg 변화(직전 ${previous.gripAvgKg.toFixed(1)}kg → 최근 ${latest.gripAvgKg.toFixed(1)}kg)`;
}
