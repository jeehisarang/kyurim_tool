import { prisma } from "@/lib/db";
import { saveHrvResultImage } from "@/lib/image-upload";
import { generateHrvExplanation, type TcmPatternMapEntry, type HrvExplanationSections } from "@/lib/hrv-explanation";
import { getExamAcademicGuide } from "@/lib/exam-academic-guide";
import { listConsultationNotesForPatient } from "@/lib/consultation-notes";
import type { HrvTestRecord } from "@/generated/prisma/client";

const RECENT_PATIENT_NOTE_LIMIT = 5;

function parseTcmPatternMap(json: string | null | undefined): TcmPatternMapEntry[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is TcmPatternMapEntry =>
        e && typeof e.symptoms === "string" && typeof e.pattern === "string" && typeof e.phrase === "string",
    );
  } catch {
    return [];
  }
}

/**
 * 한의학적 해석(4단계) 재료용 환자 증상기록 — 핵심프로필(과거력/현재질환/주요니즈) +
 * 최신 상담노트 + 최근 PatientNote를 하나의 텍스트로 조립한다(teaching-pages.ts의
 * createTeachingPage와 동일한 재료 조합 원칙). 관련성 판단은 AI 프롬프트가 담당하므로
 * 여기서는 후보 재료를 있는 그대로만 모은다.
 */
async function buildPatientSymptomMaterial(patientId: number): Promise<string | null> {
  const [patient, consultationNotes, patientNotes] = await Promise.all([
    prisma.patient.findUnique({ where: { id: patientId } }),
    listConsultationNotesForPatient(patientId),
    prisma.patientNote.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      take: RECENT_PATIENT_NOTE_LIMIT,
    }),
  ]);
  if (!patient) return null;

  const parts: string[] = [];

  const coreProfileParts = [
    patient.pastHistory ? `과거력: ${patient.pastHistory}` : null,
    patient.currentCondition ? `현재질환/주요증상: ${patient.currentCondition}` : null,
    patient.mainNeeds ? `주요니즈: ${patient.mainNeeds}` : null,
  ].filter((v): v is string => v !== null);
  if (coreProfileParts.length > 0) parts.push(`[핵심프로필]\n${coreProfileParts.join("\n")}`);

  const latestNote = consultationNotes[0];
  if (latestNote) {
    const text = latestNote.convertedChartText ?? latestNote.rawText;
    parts.push(`[최신 상담노트(${latestNote.consultationType.name})]\n${text}`);
  }

  if (patientNotes.length > 0) {
    parts.push(`[최근 메모]\n${patientNotes.map((n) => n.content).join("\n")}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

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
    where: { patientId, isActive: true },
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
): Promise<HrvExplanationSections | null> {
  try {
    const [trend, guide, patientSymptomMaterial] = await Promise.all([
      getHrvTrend(record.patientId),
      getExamAcademicGuide("HRV"),
      buildPatientSymptomMaterial(record.patientId),
    ]);
    return await generateHrvExplanation({
      vascularHealthIndex: record.vascularHealthIndex,
      vascularHealthType: record.vascularHealthType,
      avgPulse: record.avgPulse,
      stressIndex: record.stressIndex,
      trend,
      academicGuide: guide?.content ?? null,
      tcmPatternMap: parseTcmPatternMap(guide?.tcmPatternMapJson),
      patientSymptomMaterial,
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
  // 기기 리포트 2페이지(상세결과) — 항상 있는 것은 아니라 선택값(task.md).
  imageBuffer2?: Buffer | null;
  measuredByStaffId: number;
};

/**
 * HRV 검사기록 생성 — 원본 결과지 이미지(최대 2장)를 리사이즈 저장 + AI 해설을 저장 시점에
 * 동기 생성한다(BodyCompositionRecord와 동일 원칙). 1페이지 이미지 저장이 실패하면(손상
 * 파일 등) 레코드 자체를 만들지 않는다 — sourceImagePath가 필수 필드라 이미지 없이는
 * 의미가 없음. 2페이지는 실패해도 1페이지만으로 레코드를 만든다(부가 자료 취급).
 */
export async function createHrvTestRecord(input: CreateHrvTestRecordInput) {
  const { path: sourceImagePath } = await saveHrvResultImage(input.imageBuffer);
  const sourceImagePath2 = input.imageBuffer2
    ? (await saveHrvResultImage(input.imageBuffer2)).path
    : null;

  const record = await prisma.hrvTestRecord.create({
    data: {
      patientId: input.patientId,
      testDate: input.testDate,
      vascularHealthIndex: input.vascularHealthIndex,
      vascularHealthType: input.vascularHealthType,
      avgPulse: input.avgPulse,
      stressIndex: input.stressIndex,
      sourceImagePath,
      sourceImagePath2,
      measuredByStaffId: input.measuredByStaffId,
    },
  });

  const commentary = await tryGenerateHrvCommentary(record);
  if (!commentary) return record;
  return saveHrvCommentarySections(record.id, commentary);
}

function saveHrvCommentarySections(id: number, commentary: HrvExplanationSections) {
  return prisma.hrvTestRecord.update({
    where: { id },
    data: {
      aiDeviceReading: commentary.deviceReading,
      aiClinicalMeaning: commentary.clinicalMeaning,
      aiLifestyleGuide: commentary.lifestyleGuide,
      aiTcmInterpretation: commentary.tcmInterpretation,
    },
  });
}

export async function getHrvTestRecord(id: number) {
  return prisma.hrvTestRecord.findUnique({
    where: { id },
    include: { patient: true, measuredByStaff: true },
  });
}

/**
 * 과거(섹션 필드 전부 null) 레코드를 "환자와 함께보기"/원장 확인 화면에서 열람할 때 즉석
 * 생성 후 캐싱한다(ensureBodyCompositionExplanation과 동일 원칙). 레거시 aiCommentary(구
 * 단일문단 방식)만 있는 레코드는 그대로 유지하고 재생성하지 않는다 — 이미 표시 가능한
 * 콘텐츠가 있으므로 굳이 새 구조로 소급 재생성할 필요가 없다(회귀 방지, task.md).
 * 학술근거를 새로 저장한 뒤 기존 레코드에 반영하고 싶을 때는 이 함수가 아니라
 * regenerateHrvExplanation(강제 재생성)을 써야 한다 — 실사용 중 "재생성해도 그대로"라는
 * 혼동이 있었는데, 원인은 버그가 아니라 강제 재생성 수단 자체가 없었던 것이었다(task.md).
 */
export async function ensureHrvExplanation(id: number): Promise<HrvExplanationSections | null> {
  const record = await prisma.hrvTestRecord.findUnique({ where: { id } });
  if (!record) return null;
  if (record.aiDeviceReading) {
    return {
      deviceReading: record.aiDeviceReading,
      clinicalMeaning: record.aiClinicalMeaning ?? "",
      lifestyleGuide: record.aiLifestyleGuide ?? "",
      tcmInterpretation: record.aiTcmInterpretation ?? "",
    };
  }
  if (record.aiCommentary) return null;

  const commentary = await tryGenerateHrvCommentary(record);
  if (!commentary) return null;

  await saveHrvCommentarySections(id, commentary);
  return commentary;
}

/**
 * 원장 전용 확인 화면의 "AI 코멘트 재생성" 버튼 전용 — 기존 캐시(섹션이든 레거시든, 수작업
 * 편집이든)를 무시하고 최신 [학술 근거]/[한의학적 매핑표]/[환자 증상기록]으로 항상 새로
 * 생성해 덮어쓴다. ensureHrvExplanation과 달리 이미 콘텐츠가 있어도 무조건 재생성한다.
 */
export async function regenerateHrvExplanation(id: number): Promise<HrvExplanationSections | null> {
  const record = await prisma.hrvTestRecord.findUnique({ where: { id } });
  if (!record) return null;

  const commentary = await tryGenerateHrvCommentary(record);
  if (!commentary) return null;

  await saveHrvCommentarySections(id, commentary);
  return commentary;
}

export type UpdateHrvCommentaryInput = Partial<HrvExplanationSections>;

/**
 * 원장 전용 확인 화면(/examinations/hrv/[id])의 섹션별 수작업 편집 저장
 * (ProgramTeachingCreator의 saveEdit과 동일 원칙) — 넘어온 필드만 갱신한다.
 */
export async function updateHrvCommentary(id: number, input: UpdateHrvCommentaryInput) {
  return prisma.hrvTestRecord.update({
    where: { id },
    data: {
      ...(input.deviceReading !== undefined ? { aiDeviceReading: input.deviceReading } : {}),
      ...(input.clinicalMeaning !== undefined ? { aiClinicalMeaning: input.clinicalMeaning } : {}),
      ...(input.lifestyleGuide !== undefined ? { aiLifestyleGuide: input.lifestyleGuide } : {}),
      ...(input.tcmInterpretation !== undefined ? { aiTcmInterpretation: input.tcmInterpretation } : {}),
    },
  });
}

// includeInactive=false(기본값)면 소프트삭제된 기록은 제외한다(task2.md, listExaminations와
// 동일 원칙) — 검사 목록의 "비활성 항목 보기" 토글에서만 true로 호출.
export async function listHrvTestRecords(patientId?: number, includeInactive = false) {
  return prisma.hrvTestRecord.findMany({
    where: {
      ...(patientId ? { patientId } : {}),
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: { patient: true, measuredByStaff: true },
    orderBy: { testDate: "desc" },
  });
}

// 소프트 삭제(task2.md) — deleteBodyCompositionRecord/deleteStrengthTestRecord와 동일한
// 권한 원칙(별도 제한 없음, Visit 삭제와 동일 신뢰 모델).
export async function deleteHrvTestRecord(id: number) {
  return prisma.hrvTestRecord.update({ where: { id }, data: { isActive: false } });
}
