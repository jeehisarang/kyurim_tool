import { prisma } from "@/lib/db";
import {
  computeSmi,
  judgeSmi,
  calcGripAvg,
  judgeGrip,
  computeGripAge,
  computeBmi,
  computeSmiFourLevel,
  computeGripFourLevel,
  FOUR_LEVEL_JUDGEMENT_LABEL,
  gripAgePatientMessage,
  type Gender,
} from "@/lib/exam-thresholds";
import { getExamTrend } from "@/lib/program-teaching";
import { generateExamExplanation } from "@/lib/exam-explanation";
import type { BodyCompositionRecord, StrengthTestRecord } from "@/generated/prisma/client";

// height/gender는 Patient의 고정값 — 이번 요청에 값이 실려오면 Patient에도 반영해서
// 다음 검사부터는 재입력 없이 재사용되게 한다. 인바디/근력검사 생성·수정 양쪽에서 공유.
async function resolvePatientHeightAndGender(
  patientId: number,
  heightCmInput: number | undefined,
  genderInput: Gender | undefined,
): Promise<{ heightCm?: number; gender?: Gender }> {
  let patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });

  if (heightCmInput !== undefined || genderInput !== undefined) {
    patient = await prisma.patient.update({
      where: { id: patientId },
      data: {
        ...(heightCmInput !== undefined ? { height: heightCmInput } : {}),
        ...(genderInput !== undefined ? { gender: genderInput } : {}),
      },
    });
  }

  return {
    heightCm: heightCmInput ?? patient.height ?? undefined,
    gender: genderInput ?? (patient.gender as Gender | null) ?? undefined,
  };
}

async function resolvePatientGender(patientId: number, genderInput: Gender | undefined): Promise<Gender> {
  let patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });

  if (genderInput !== undefined) {
    patient = await prisma.patient.update({ where: { id: patientId }, data: { gender: genderInput } });
  }

  const gender = genderInput ?? (patient.gender as Gender | null);
  if (!gender) {
    throw new Error("환자의 성별 정보가 없습니다. (호출측에서 먼저 검증했어야 함)");
  }
  return gender;
}

type LimbInputs = {
  armMuscleMassLeftKg?: number;
  armMuscleMassRightKg?: number;
  legMuscleMassLeftKg?: number;
  legMuscleMassRightKg?: number;
};

// 4개 다 입력된 경우에만 limbMuscleMassKg/smi/smiJudgement를 계산한다(하나라도 비면 셋 다 null).
function computeBodyCompositionDerived(
  heightCm: number | undefined,
  limbs: LimbInputs,
  gender: Gender | undefined,
): { limbMuscleMassKg: number | null; smi: number | null; smiJudgement: string | null } {
  const hasAllLimbs =
    limbs.armMuscleMassLeftKg !== undefined &&
    limbs.armMuscleMassRightKg !== undefined &&
    limbs.legMuscleMassLeftKg !== undefined &&
    limbs.legMuscleMassRightKg !== undefined;

  if (hasAllLimbs && heightCm !== undefined) {
    const result = computeSmi(
      heightCm,
      limbs.armMuscleMassRightKg!,
      limbs.armMuscleMassLeftKg!,
      limbs.legMuscleMassRightKg!,
      limbs.legMuscleMassLeftKg!,
    );
    return {
      limbMuscleMassKg: result.limbMuscleMassKg,
      smi: result.smi,
      smiJudgement: gender ? judgeSmi(gender, result.smi) : null,
    };
  }

  return { limbMuscleMassKg: null, smi: null, smiJudgement: null };
}

// AI 해설 코멘트(task.md) — 실패해도 검사 저장 자체는 반드시 성공해야 하므로, 이 두
// 헬퍼는 절대 throw하지 않는다(에러는 서버 로그로만 기록하고 null 반환). 신규 저장
// 직후(createXxxRecord)와 과거 레코드 즉석 생성(ensureXxxExplanation) 양쪽에서 공유한다.
async function tryGenerateBodyCompositionExplanation(
  record: Pick<BodyCompositionRecord, "patientId" | "weightKg" | "bodyFatPercent" | "whr" | "smi">,
  heightCm: number | undefined,
  gender: Gender | undefined,
): Promise<string | null> {
  try {
    const bmi = heightCm !== undefined ? computeBmi(record.weightKg, heightCm) : null;
    const judgementLabel =
      gender && record.smi != null ? FOUR_LEVEL_JUDGEMENT_LABEL[computeSmiFourLevel(gender, record.smi)] : null;
    const trend = await getExamTrend(record.patientId, "BODY_COMPOSITION");
    return await generateExamExplanation({
      examType: "BODY_COMPOSITION",
      weightKg: record.weightKg,
      bmi,
      bodyFatPercent: record.bodyFatPercent,
      whr: record.whr,
      smi: record.smi,
      judgementLabel,
      trend,
    });
  } catch (err) {
    console.error("[exam-explanation] 인바디 해설 생성 실패:", err);
    return null;
  }
}

async function tryGenerateStrengthTestExplanation(
  record: Pick<
    StrengthTestRecord,
    "patientId" | "measuredAge" | "gripLeftKg" | "gripRightKg" | "gripAvgKg" | "estimatedGripAge" | "gripAgeOutOfRange"
  >,
  gender: Gender,
): Promise<string | null> {
  try {
    const fourLevel = computeGripFourLevel(gender, record.measuredAge, record.gripAvgKg);
    const judgementLabel = fourLevel ? FOUR_LEVEL_JUDGEMENT_LABEL[fourLevel] : null;
    const gripAgeMessage = gripAgePatientMessage(
      record.estimatedGripAge,
      record.gripAgeOutOfRange as ReturnType<typeof computeGripAge>["outOfRange"],
    );
    const trend = await getExamTrend(record.patientId, "STRENGTH_TEST");
    return await generateExamExplanation({
      examType: "STRENGTH_TEST",
      gripLeftKg: record.gripLeftKg,
      gripRightKg: record.gripRightKg,
      gripAvgKg: record.gripAvgKg,
      judgementLabel,
      gripAgeMessage,
      trend,
    });
  } catch (err) {
    console.error("[exam-explanation] 근력검사 해설 생성 실패:", err);
    return null;
  }
}

// 과거(aiExplanation=null) 레코드를 "환자와 함께보기"에서 열람할 때 즉석 생성 후 캐싱한다
// (task.md 지시 — 매번 새로 만들지 않고 한 번 생성되면 재사용). 이미 생성돼 있으면 그대로 반환.
export async function ensureBodyCompositionExplanation(id: number): Promise<string | null> {
  const record = await prisma.bodyCompositionRecord.findUnique({ where: { id }, include: { patient: true } });
  if (!record) return null;
  if (record.aiExplanation) return record.aiExplanation;

  const explanation = await tryGenerateBodyCompositionExplanation(
    record,
    record.patient.height ?? undefined,
    (record.patient.gender as Gender | null) ?? undefined,
  );
  if (!explanation) return null;

  await prisma.bodyCompositionRecord.update({ where: { id }, data: { aiExplanation: explanation } });
  return explanation;
}

export async function ensureStrengthTestExplanation(id: number): Promise<string | null> {
  const record = await prisma.strengthTestRecord.findUnique({ where: { id }, include: { patient: true } });
  if (!record) return null;
  if (record.aiExplanation) return record.aiExplanation;

  const gender = record.patient.gender as Gender | null;
  if (!gender) return null; // 성별 미입력이면 4단계 판정을 못 내 생성 재료가 부족 — 조용히 스킵.

  const explanation = await tryGenerateStrengthTestExplanation(record, gender);
  if (!explanation) return null;

  await prisma.strengthTestRecord.update({ where: { id }, data: { aiExplanation: explanation } });
  return explanation;
}

type BodyCompositionInput = {
  patientId: number;
  prescriptionId?: number;
  examDate: Date;
  weightKg: number;
  bodyFatPercent: number;
  whr: number;
  heightCm?: number;
  gender?: Gender;
  armMuscleMassLeftKg?: number;
  armMuscleMassRightKg?: number;
  legMuscleMassLeftKg?: number;
  legMuscleMassRightKg?: number;
  note?: string;
};

// 인바디 저장 시 원본 입력값만 받아 서버에서 재계산한다(클라이언트 계산값 불신 원칙).
export async function createBodyCompositionRecord(input: BodyCompositionInput & { staffUserId: number }) {
  const { heightCm, gender } = await resolvePatientHeightAndGender(
    input.patientId,
    input.heightCm,
    input.gender,
  );
  const derived = computeBodyCompositionDerived(heightCm, input, gender);

  const record = await prisma.bodyCompositionRecord.create({
    data: {
      patientId: input.patientId,
      prescriptionId: input.prescriptionId,
      examDate: input.examDate,
      weightKg: input.weightKg,
      bodyFatPercent: input.bodyFatPercent,
      whr: input.whr,
      armMuscleMassLeftKg: input.armMuscleMassLeftKg ?? null,
      armMuscleMassRightKg: input.armMuscleMassRightKg ?? null,
      legMuscleMassLeftKg: input.legMuscleMassLeftKg ?? null,
      legMuscleMassRightKg: input.legMuscleMassRightKg ?? null,
      ...derived,
      note: input.note,
      staffUserId: input.staffUserId,
    },
  });

  // 저장 시점에 동기적으로 함께 생성한다(task.md — 원장님이 저장 직후 바로 "환자와
  // 함께보기"로 넘어가는 실사용 흐름이라 지연 없이 바로 보여야 함). 실패해도 위 create는
  // 이미 끝난 뒤이므로 검사 저장 자체는 영향받지 않는다.
  const explanation = await tryGenerateBodyCompositionExplanation(record, heightCm, gender);
  if (!explanation) return record;
  return prisma.bodyCompositionRecord.update({ where: { id: record.id }, data: { aiExplanation: explanation } });
}

// 인바디 수정. 생성과 동일한 원칙 — 원본 입력값만 받아 서버에서 재계산.
export async function updateBodyCompositionRecord(id: number, input: BodyCompositionInput) {
  const { heightCm, gender } = await resolvePatientHeightAndGender(
    input.patientId,
    input.heightCm,
    input.gender,
  );
  const derived = computeBodyCompositionDerived(heightCm, input, gender);

  return prisma.bodyCompositionRecord.update({
    where: { id },
    data: {
      prescriptionId: input.prescriptionId,
      examDate: input.examDate,
      weightKg: input.weightKg,
      bodyFatPercent: input.bodyFatPercent,
      whr: input.whr,
      armMuscleMassLeftKg: input.armMuscleMassLeftKg ?? null,
      armMuscleMassRightKg: input.armMuscleMassRightKg ?? null,
      legMuscleMassLeftKg: input.legMuscleMassLeftKg ?? null,
      legMuscleMassRightKg: input.legMuscleMassRightKg ?? null,
      ...derived,
      note: input.note,
    },
  });
}

export async function getBodyCompositionRecord(id: number) {
  return prisma.bodyCompositionRecord.findUnique({
    where: { id },
    include: { patient: true, staffUser: true, prescription: { include: { program: true } } },
  });
}

// 검사기록은 하위 참조 테이블이 없어 하드 삭제한다(소프트삭제 불필요).
export async function deleteBodyCompositionRecord(id: number) {
  return prisma.bodyCompositionRecord.delete({ where: { id } });
}

type StrengthTestInput = {
  patientId: number;
  prescriptionId?: number;
  examDate: Date;
  gender?: Gender;
  measuredAge: number;
  gripLeftKg: number;
  gripRightKg: number;
};

// 악력/근력나이 계산과 판정은 항상 여기서(서버) 원본 입력값으로부터 다시 계산한다 —
// 클라이언트가 함께 보낸 계산값/판정값이 있어도 무시하고 신뢰하지 않는다.
// SMI/사지골격근량/키는 인바디(BodyCompositionRecord) 전용이라 근력검사에는 없다 —
// 근감소증 진단은 SMI(인바디)와 악력(근력검사) 두 지표가 원래 별개이기 때문.
// gender는 자체 필드 없이 Patient의 고정값을 참조한다 — createBodyCompositionRecord와 동일한
// 패턴(값이 실려오면 Patient에도 반영해서 다음 검사부터 재입력 없이 재사용).
export async function createStrengthTestRecord(input: StrengthTestInput & { staffUserId: number }) {
  const gender = await resolvePatientGender(input.patientId, input.gender);
  const gripAvgKg = calcGripAvg(input.gripLeftKg, input.gripRightKg);
  const gripJudgement = judgeGrip(gender, input.measuredAge, gripAvgKg);
  const { estimatedAge, outOfRange } = computeGripAge(gender, gripAvgKg);

  const record = await prisma.strengthTestRecord.create({
    data: {
      patientId: input.patientId,
      prescriptionId: input.prescriptionId,
      examDate: input.examDate,
      measuredAge: input.measuredAge,
      gripLeftKg: input.gripLeftKg,
      gripRightKg: input.gripRightKg,
      gripAvgKg,
      gripJudgement,
      estimatedGripAge: estimatedAge,
      gripAgeOutOfRange: outOfRange,
      staffUserId: input.staffUserId,
    },
  });

  // BodyCompositionRecord와 동일한 원칙 — 저장 시점 동기 생성, 실패해도 저장엔 영향 없음.
  const explanation = await tryGenerateStrengthTestExplanation(record, gender);
  if (!explanation) return record;
  return prisma.strengthTestRecord.update({ where: { id: record.id }, data: { aiExplanation: explanation } });
}

// 근력검사 수정. 생성과 동일한 원칙 — 원본 입력값만 받아 서버에서 재계산.
export async function updateStrengthTestRecord(id: number, input: StrengthTestInput) {
  const gender = await resolvePatientGender(input.patientId, input.gender);
  const gripAvgKg = calcGripAvg(input.gripLeftKg, input.gripRightKg);
  const gripJudgement = judgeGrip(gender, input.measuredAge, gripAvgKg);
  const { estimatedAge, outOfRange } = computeGripAge(gender, gripAvgKg);

  return prisma.strengthTestRecord.update({
    where: { id },
    data: {
      prescriptionId: input.prescriptionId,
      examDate: input.examDate,
      measuredAge: input.measuredAge,
      gripLeftKg: input.gripLeftKg,
      gripRightKg: input.gripRightKg,
      gripAvgKg,
      gripJudgement,
      estimatedGripAge: estimatedAge,
      gripAgeOutOfRange: outOfRange,
    },
  });
}

export async function getStrengthTestRecord(id: number) {
  return prisma.strengthTestRecord.findUnique({
    where: { id },
    include: { patient: true, staffUser: true, prescription: { include: { program: true } } },
  });
}

// 검사기록은 하위 참조 테이블이 없어 하드 삭제한다(소프트삭제 불필요).
export async function deleteStrengthTestRecord(id: number) {
  return prisma.strengthTestRecord.delete({ where: { id } });
}

export async function listExaminations(patientId?: number) {
  const [bodyRecords, strengthRecords] = await Promise.all([
    prisma.bodyCompositionRecord.findMany({
      where: patientId ? { patientId } : undefined,
      include: { patient: true, staffUser: true },
    }),
    prisma.strengthTestRecord.findMany({
      where: patientId ? { patientId } : undefined,
      include: { patient: true, staffUser: true },
    }),
  ]);

  const rows = [
    ...bodyRecords.map((r) => ({
      id: r.id,
      examType: "BODY_COMPOSITION" as const,
      patient: {
        id: r.patient.id,
        name: r.patient.name,
        chartNumber: r.patient.chartNumber,
        height: r.patient.height,
      },
      examDate: r.examDate,
      staffUserName: r.staffUser.name,
      weightKg: r.weightKg,
      bodyFatPercent: r.bodyFatPercent,
      whr: r.whr,
      limbMuscleMassKg: r.limbMuscleMassKg,
      smi: r.smi,
      smiJudgement: r.smiJudgement,
      note: r.note,
    })),
    ...strengthRecords.map((r) => ({
      id: r.id,
      examType: "STRENGTH_TEST" as const,
      patient: { id: r.patient.id, name: r.patient.name, chartNumber: r.patient.chartNumber },
      examDate: r.examDate,
      staffUserName: r.staffUser.name,
      measuredAge: r.measuredAge,
      gripLeftKg: r.gripLeftKg,
      gripRightKg: r.gripRightKg,
      gripAvgKg: r.gripAvgKg,
      gripJudgement: r.gripJudgement,
      estimatedGripAge: r.estimatedGripAge,
      gripAgeOutOfRange: r.gripAgeOutOfRange,
    })),
  ];

  // 13-6 "누적 기록 필수 — 추이 확인" 요건상 시스템 기록 생성 시각(createdAt)이 아니라
  // 실제 검사가 이뤄진 날짜(examDate) 기준으로 정렬해야 소급 입력 시에도 순서가 맞다.
  rows.sort((a, b) => b.examDate.getTime() - a.examDate.getTime());
  return rows;
}
