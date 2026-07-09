import { prisma } from "@/lib/db";
import { computeSmi, judgeSmi, calcGripAvg, judgeGrip, computeGripAge, type Gender } from "@/lib/exam-thresholds";

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

  return prisma.bodyCompositionRecord.create({
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

  return prisma.strengthTestRecord.create({
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
