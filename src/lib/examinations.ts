import { prisma } from "@/lib/db";
import { calcSmi, judgeSmi, calcGripAvg, judgeGrip, type Gender } from "@/lib/exam-thresholds";

export async function createBodyCompositionRecord(input: {
  patientId: number;
  prescriptionId?: number;
  measuredAt: Date;
  weightKg: number;
  note?: string;
  staffUserId: number;
}) {
  return prisma.bodyCompositionRecord.create({
    data: {
      patientId: input.patientId,
      prescriptionId: input.prescriptionId,
      measuredAt: input.measuredAt,
      weightKg: input.weightKg,
      note: input.note,
      staffUserId: input.staffUserId,
    },
  });
}

// SMI/악력 계산과 판정은 항상 여기서(서버) 원본 입력값으로부터 다시 계산한다 —
// 클라이언트가 함께 보낸 계산값/판정값이 있어도 무시하고 신뢰하지 않는다.
export async function createStrengthTestRecord(input: {
  patientId: number;
  prescriptionId?: number;
  measuredAt: Date;
  gender: Gender;
  measuredAge: number;
  heightCm: number;
  armMuscleMassLeftKg: number;
  armMuscleMassRightKg: number;
  legMuscleMassLeftKg: number;
  legMuscleMassRightKg: number;
  gripLeftKg: number;
  gripRightKg: number;
  staffUserId: number;
}) {
  const smi = calcSmi(input);
  const smiJudgement = judgeSmi(input.gender, smi);
  const gripAvgKg = calcGripAvg(input.gripLeftKg, input.gripRightKg);
  const gripJudgement = judgeGrip(input.gender, input.measuredAge, gripAvgKg);

  return prisma.strengthTestRecord.create({
    data: {
      patientId: input.patientId,
      prescriptionId: input.prescriptionId,
      measuredAt: input.measuredAt,
      gender: input.gender,
      measuredAge: input.measuredAge,
      heightCm: input.heightCm,
      armMuscleMassLeftKg: input.armMuscleMassLeftKg,
      armMuscleMassRightKg: input.armMuscleMassRightKg,
      legMuscleMassLeftKg: input.legMuscleMassLeftKg,
      legMuscleMassRightKg: input.legMuscleMassRightKg,
      smi,
      smiJudgement,
      gripLeftKg: input.gripLeftKg,
      gripRightKg: input.gripRightKg,
      gripAvgKg,
      gripJudgement,
      staffUserId: input.staffUserId,
    },
  });
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
      patient: { id: r.patient.id, name: r.patient.name, chartNumber: r.patient.chartNumber },
      measuredAt: r.measuredAt,
      staffUserName: r.staffUser.name,
      weightKg: r.weightKg,
      note: r.note,
    })),
    ...strengthRecords.map((r) => ({
      id: r.id,
      examType: "STRENGTH_TEST" as const,
      patient: { id: r.patient.id, name: r.patient.name, chartNumber: r.patient.chartNumber },
      measuredAt: r.measuredAt,
      staffUserName: r.staffUser.name,
      smi: r.smi,
      smiJudgement: r.smiJudgement,
      gripAvgKg: r.gripAvgKg,
      gripJudgement: r.gripJudgement,
    })),
  ];

  rows.sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime());
  return rows;
}
