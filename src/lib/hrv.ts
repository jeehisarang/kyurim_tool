import { prisma } from "@/lib/db";
import { saveHrvResultImage } from "@/lib/image-upload";
import { generateHrvExplanation } from "@/lib/hrv-explanation";
import { getExamAcademicGuide } from "@/lib/exam-academic-guide";
import type { HrvTestRecord } from "@/generated/prisma/client";

function formatSignedDiff(diff: number): string {
  const rounded = Math.round(diff * 10) / 10;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

/**
 * 같은 환자의 HRV 검사 최근 2건을 비교한 변화량 요약(exam-explanation.ts의 getExamTrend와
 * 동일 원칙) — 혈관건강지수를 핵심 지표로 비교한다. 기록이 1건뿐이면(첫 검사) null.
 */
export async function getHrvTrend(patientId: number): Promise<string | null> {
  const records = await prisma.hrvTestRecord.findMany({
    where: { patientId },
    orderBy: { testDate: "desc" },
    take: 2,
  });
  if (records.length < 2) return null;
  const [latest, previous] = records;
  const diff = latest.vascularHealthIndex - previous.vascularHealthIndex;
  if (diff === 0) return null;
  return `혈관건강지수 ${formatSignedDiff(diff)} 변화(직전 ${previous.vascularHealthIndex} → 최근 ${latest.vascularHealthIndex})`;
}

// AI 해설 생성 실패해도 검사 저장 자체는 반드시 성공해야 한다(examinations.ts와 동일 원칙) —
// 절대 throw하지 않고 실패 시 null만 반환한다.
async function tryGenerateHrvCommentary(
  record: Pick<HrvTestRecord, "patientId" | "vascularHealthIndex" | "vascularHealthType" | "avgPulse" | "stressIndex">,
): Promise<string | null> {
  try {
    const trend = await getHrvTrend(record.patientId);
    const guide = await getExamAcademicGuide("HRV");
    return await generateHrvExplanation({
      vascularHealthIndex: record.vascularHealthIndex,
      vascularHealthType: record.vascularHealthType,
      avgPulse: record.avgPulse,
      stressIndex: record.stressIndex,
      trend,
      academicGuide: guide?.content ?? null,
    });
  } catch (err) {
    console.error("[hrv] AI 해설 생성 실패:", err);
    return null;
  }
}

export type CreateHrvTestRecordInput = {
  patientId: number;
  testDate: Date;
  vascularHealthIndex: number;
  vascularHealthType: string;
  avgPulse: number;
  stressIndex: number;
  imageBuffer: Buffer;
  measuredByStaffId: number;
};

/**
 * HRV 검사기록 생성 — 원본 결과지 이미지를 리사이즈 저장 + AI 해설을 저장 시점에 동기
 * 생성한다(BodyCompositionRecord와 동일 원칙). 이미지 저장이 실패하면(손상 파일 등)
 * 레코드 자체를 만들지 않는다 — sourceImagePath가 필수 필드라 이미지 없이는 의미가 없음.
 */
export async function createHrvTestRecord(input: CreateHrvTestRecordInput) {
  const { path: sourceImagePath } = await saveHrvResultImage(input.imageBuffer);

  const record = await prisma.hrvTestRecord.create({
    data: {
      patientId: input.patientId,
      testDate: input.testDate,
      vascularHealthIndex: input.vascularHealthIndex,
      vascularHealthType: input.vascularHealthType,
      avgPulse: input.avgPulse,
      stressIndex: input.stressIndex,
      sourceImagePath,
      measuredByStaffId: input.measuredByStaffId,
    },
  });

  const commentary = await tryGenerateHrvCommentary(record);
  if (!commentary) return record;
  return prisma.hrvTestRecord.update({ where: { id: record.id }, data: { aiCommentary: commentary } });
}

export async function getHrvTestRecord(id: number) {
  return prisma.hrvTestRecord.findUnique({
    where: { id },
    include: { patient: true, measuredByStaff: true },
  });
}

/**
 * 과거(aiCommentary=null) 레코드를 "환자와 함께보기"에서 열람할 때 즉석 생성 후 캐싱한다
 * (ensureBodyCompositionExplanation과 동일 원칙). 이미 생성돼 있으면 그대로 반환.
 */
export async function ensureHrvExplanation(id: number): Promise<string | null> {
  const record = await prisma.hrvTestRecord.findUnique({ where: { id } });
  if (!record) return null;
  if (record.aiCommentary) return record.aiCommentary;

  const commentary = await tryGenerateHrvCommentary(record);
  if (!commentary) return null;

  await prisma.hrvTestRecord.update({ where: { id }, data: { aiCommentary: commentary } });
  return commentary;
}

export async function listHrvTestRecords(patientId?: number) {
  return prisma.hrvTestRecord.findMany({
    where: patientId ? { patientId } : undefined,
    include: { patient: true, measuredByStaff: true },
    orderBy: { testDate: "desc" },
  });
}
