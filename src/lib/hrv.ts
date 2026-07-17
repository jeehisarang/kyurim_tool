import { prisma } from "@/lib/db";
import { saveHrvResultImage, readUploadedImageAsBase64 } from "@/lib/image-upload";
import {
  generateHrvExplanation,
  HRV_COMMENTARY_VERSION,
  type TcmPatternMapEntry,
  type HrvExplanationSections,
} from "@/lib/hrv-explanation";
import { getExamAcademicGuide } from "@/lib/exam-academic-guide";
import { listConsultationNotesForPatient } from "@/lib/consultation-notes";
import {
  getTcmCategoryProfileForAi,
  getCandidateCheckedSymptoms,
  getRedFlagNoticeForCandidates,
  type CheckedSymptomItem,
} from "@/lib/tcm-checklist";
import {
  computeNotableChanges,
  pickHeadlineSymptoms,
  ensureTreatmentConsultDisclaimer,
  type NotableChange,
  type HrvMetricsSnapshot,
} from "@/lib/hrv-health-report";
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
 * 한의학적 해석(카드4) 재료용 환자 증상기록 — 핵심프로필(과거력/현재질환/주요니즈) +
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

// 자율신경균형도/맥박다양성 데이터는 리포트 이미지에 있다 — 과거 2장 체제에서는 2페이지가
// 그 상세 리포트였고, 1장 체제로 바뀐 신규 기록은 sourceImagePath 자체가 그 종합 리포트다.
// sourceImagePath2가 있으면 그쪽을 우선한다.
function primaryHrvImagePath(record: Pick<HrvTestRecord, "sourceImagePath" | "sourceImagePath2">): string {
  return record.sourceImagePath2 ?? record.sourceImagePath;
}

function toMetricsSnapshot(record: Pick<HrvTestRecord, "vascularHealthIndex" | "vascularHealthType" | "avgPulse" | "stressIndex">): HrvMetricsSnapshot {
  return {
    vascularHealthIndex: record.vascularHealthIndex,
    vascularHealthType: record.vascularHealthType,
    avgPulse: record.avgPulse,
    stressIndex: record.stressIndex,
  };
}

/**
 * 같은 환자의 직전 HRV 검사 1건 + 그 리포트 이미지(base64)를 조회한다 — 자율신경균형도 구역
 * 이동 방향 서술(카드4)과 카드3(주목할 변화) 계산 양쪽에서 재사용한다. 기록이 1건뿐이면(첫
 * 검사) 둘 다 null.
 */
async function getPreviousHrvRecord(
  patientId: number,
): Promise<{ previousMetrics: HrvMetricsSnapshot | null; previousImageBase64: string | null }> {
  const records = await prisma.hrvTestRecord.findMany({
    where: { patientId, isActive: true },
    orderBy: { testDate: "desc" },
    take: 2,
  });
  if (records.length < 2) return { previousMetrics: null, previousImageBase64: null };
  const previous = records[1];
  const previousImageBase64 = await readUploadedImageAsBase64(primaryHrvImagePath(previous));
  return { previousMetrics: toMetricsSnapshot(previous), previousImageBase64 };
}

export type HrvCommentaryBundle = {
  ai: HrvExplanationSections;
  checkedSymptoms: CheckedSymptomItem[];
  notableChanges: NotableChange[];
  redFlagNotice: string | null;
};

// AI 해설 생성 실패해도 검사 저장 자체는 반드시 성공해야 한다(examinations.ts와 동일 원칙) —
// 절대 throw하지 않고 실패 시 null만 반환한다. 카드2(내가 선택한 증상)/카드3(주목할 변화)/
// 카드6(위험신호)은 AI가 아니라 코드가 계산하므로(task.md, 지어내면 안 되는 정확한 데이터),
// 이 함수는 AI 텍스트(카드1/4/5/7)와 코드 계산 데이터를 하나로 묶어 반환한다.
async function tryGenerateHrvCommentary(
  record: Pick<
    HrvTestRecord,
    "patientId" | "vascularHealthIndex" | "vascularHealthType" | "avgPulse" | "stressIndex" | "sourceImagePath" | "sourceImagePath2"
  >,
): Promise<HrvCommentaryBundle | null> {
  try {
    const [
      { previousMetrics, previousImageBase64 },
      guide,
      patientSymptomMaterial,
      imageBase64,
      tcmCategoryProfile,
      checkedSymptoms,
      redFlagNotice,
    ] = await Promise.all([
      getPreviousHrvRecord(record.patientId),
      getExamAcademicGuide("HRV"),
      buildPatientSymptomMaterial(record.patientId),
      readUploadedImageAsBase64(primaryHrvImagePath(record)),
      // 증상 패턴 프로필(task.md) — 후보가 있으면 이걸 우선 근거로 쓰고, 없으면(null) 기존
      // tcmPatternMap/patientSymptomMaterial 자유텍스트 방식이 그대로 동작한다(병행 원칙).
      getTcmCategoryProfileForAi(record.patientId),
      // 카드1(헤드라인)/카드2(내가 선택한 증상) 재료 — 후보 카테고리의 체크 문항 원문.
      getCandidateCheckedSymptoms(record.patientId),
      // 카드6(위험신호) 재료 — 후보 카테고리에 원장이 입력한 고정문구가 있으면 그대로.
      getRedFlagNoticeForCandidates(record.patientId),
    ]);

    const ai = await generateHrvExplanation({
      vascularHealthIndex: record.vascularHealthIndex,
      vascularHealthType: record.vascularHealthType,
      avgPulse: record.avgPulse,
      stressIndex: record.stressIndex,
      academicGuide: guide?.content ?? null,
      tcmPatternMap: parseTcmPatternMap(guide?.tcmPatternMapJson),
      patientSymptomMaterial,
      imageBase64,
      previousImageBase64,
      tcmCategoryProfile,
      checkedSymptomsForHeadline: pickHeadlineSymptoms(checkedSymptoms),
    });

    const notableChanges = previousMetrics ? computeNotableChanges(previousMetrics, toMetricsSnapshot(record)) : [];

    return { ai, checkedSymptoms, notableChanges, redFlagNotice };
  } catch (err) {
    console.error("[hrv] 건강 리포트 생성 실패:", err);
    return null;
  }
}

export type CreateHrvTestRecordInput = {
  patientId: number;
  testDate: Date;
  vascularHealthIndex: number;
  vascularHealthType: string;
  avgPulse: number;
  // null 허용 — 유비오맥파 CSV 자동연동(task.md)에서 "혈관건강도 측정"만 한 행. 수동 등록
  // 화면(POST /api/hrv-records)은 여전히 자체 검증에서 이 값을 필수로 요구하므로 그 경로로는
  // null이 들어올 일이 없다.
  stressIndex: number | null;
  imageBuffer: Buffer;
  // 기기 리포트 2페이지(상세결과) — 항상 있는 것은 아니라 선택값(task.md).
  imageBuffer2?: Buffer | null;
  // null 허용 — CSV에는 담당 직원 정보가 없다(유비오맥파 CSV 자동연동, task.md). 화면은
  // "자동연동"으로 표시. 수동 등록 화면은 여전히 자체 검증에서 필수로 요구한다.
  measuredByStaffId: number | null;
  // 아래부터 유비오맥파 CSV 자동연동 전용(task.md) — 수동 등록 경로는 전부 undefined로 둔다.
  tp?: number | null;
  vlf?: number | null;
  lf?: number | null;
  hf?: number | null;
  lfHfRatio?: number | null;
  sdnn?: number | null;
  rmssd?: number | null;
  // "사용자명|측정일시(ISO)" — 같은 CSV 행 재스캔 시 중복 생성 방지용 유니크 키.
  csvSourceKey?: string;
};

/**
 * HRV 검사기록 생성 — 원본 결과지 이미지(최대 2장)를 리사이즈 저장 + 건강 리포트를 저장
 * 시점에 동기 생성한다(BodyCompositionRecord와 동일 원칙). 1페이지 이미지 저장이 실패하면
 * (손상 파일 등) 레코드 자체를 만들지 않는다 — sourceImagePath가 필수 필드라 이미지 없이는
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
      tp: input.tp ?? null,
      vlf: input.vlf ?? null,
      lf: input.lf ?? null,
      hf: input.hf ?? null,
      lfHfRatio: input.lfHfRatio ?? null,
      sdnn: input.sdnn ?? null,
      rmssd: input.rmssd ?? null,
      csvSourceKey: input.csvSourceKey,
      sourceImagePath,
      sourceImagePath2,
      measuredByStaffId: input.measuredByStaffId,
    },
  });

  const commentary = await tryGenerateHrvCommentary(record);
  if (!commentary) return record;
  return saveHrvCommentarySections(record.id, commentary);
}

// 건강 리포트를 실제로 새로 생성해서 저장하는 유일한 지점이라, aiCommentaryVersion도
// 여기서만 함께 채운다. 캐시된 값을 그대로 반환하는 경로(ensureHrvExplanation의 조기 반환)는
// 이 함수를 거치지 않으므로 기존 버전 값이 그대로 유지된다.
function saveHrvCommentarySections(id: number, commentary: HrvCommentaryBundle) {
  return prisma.hrvTestRecord.update({
    where: { id },
    data: {
      aiDeviceReading: commentary.ai.headline,
      aiTcmInterpretation: commentary.ai.tcmInterpretation,
      aiProgressionCard: commentary.ai.progression,
      aiLifestyleGuide: ensureTreatmentConsultDisclaimer(commentary.ai.treatmentAndLifestyle),
      aiCheckedSymptomsJson: JSON.stringify(commentary.checkedSymptoms),
      aiClinicalMeaning: commentary.notableChanges.length > 0 ? JSON.stringify(commentary.notableChanges) : null,
      aiRedFlagNotice: commentary.redFlagNotice,
      aiCommentaryVersion: HRV_COMMENTARY_VERSION,
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
 * 콘텐츠가 있으므로 굳이 새 구조로 소급 재생성할 필요가 없다(회귀 방지).
 * 학술근거를 새로 저장한 뒤 기존 레코드에 반영하고 싶을 때는 이 함수가 아니라
 * regenerateHrvExplanation(강제 재생성)을 써야 한다.
 */
export async function ensureHrvExplanation(id: number): Promise<HrvExplanationSections | null> {
  const record = await prisma.hrvTestRecord.findUnique({ where: { id } });
  if (!record) return null;
  if (record.aiDeviceReading) {
    return {
      headline: record.aiDeviceReading,
      tcmInterpretation: record.aiTcmInterpretation ?? "",
      progression: record.aiProgressionCard ?? "",
      treatmentAndLifestyle: record.aiLifestyleGuide ?? "",
    };
  }
  if (record.aiCommentary) return null;

  const commentary = await tryGenerateHrvCommentary(record);
  if (!commentary) return null;

  await saveHrvCommentarySections(id, commentary);
  return commentary.ai;
}

/**
 * 원장 전용 확인 화면의 "리포트 다시 만들기" 버튼 전용(task.md 명칭 변경 — 기존 "AI 코멘트
 * 재생성") — 기존 캐시(카드든, 레거시든, 수작업 편집이든)를 무시하고 최신 [학술 근거]/
 * [한의학적 매핑표]/[환자 증상기록]/[증상 패턴 프로필]으로 항상 새로 생성해 덮어쓴다.
 * ensureHrvExplanation과 달리 이미 콘텐츠가 있어도 무조건 재생성한다.
 */
export async function regenerateHrvExplanation(id: number): Promise<HrvExplanationSections | null> {
  const record = await prisma.hrvTestRecord.findUnique({ where: { id } });
  if (!record) return null;

  const commentary = await tryGenerateHrvCommentary(record);
  if (!commentary) return null;

  await saveHrvCommentarySections(id, commentary);
  return commentary.ai;
}

// clinicalMeaning은 레거시 레코드(MIBYEONG_V1/구버전) 전용 — 그 시절 카드2("결과와 추이"/
// "임상적 의미")는 자유 텍스트였고 지금도 그 레코드들은 그대로 수작업 편집 대상이다. 신버전
// (HEALTH_REPORT_V1)의 aiClinicalMeaning은 카드3(주목할 변화) JSON 스냅샷이라 이 경로로
// 편집하지 않는다(호출측이 애초에 이 키를 보내지 않는다, examinations/hrv/[id]/page.tsx 참고).
export type UpdateHrvCommentaryInput = Partial<HrvExplanationSections> & { clinicalMeaning?: string };

/**
 * 원장 전용 확인 화면(/examinations/hrv/[id])의 카드별 수작업 편집 저장(task.md 명칭 변경 —
 * 기존 "코멘트 수정") — 넘어온 필드만 갱신한다. 카드2/3/6(코드 계산 데이터)은 수작업 편집
 * 대상이 아니다(체크리스트/원장 입력 데이터 자체를 고치는 게 정답이라 이 화면에서 직접
 * 편집하지 않는다).
 */
export async function updateHrvCommentary(id: number, input: UpdateHrvCommentaryInput) {
  return prisma.hrvTestRecord.update({
    where: { id },
    data: {
      ...(input.headline !== undefined ? { aiDeviceReading: input.headline } : {}),
      ...(input.clinicalMeaning !== undefined ? { aiClinicalMeaning: input.clinicalMeaning } : {}),
      ...(input.tcmInterpretation !== undefined ? { aiTcmInterpretation: input.tcmInterpretation } : {}),
      ...(input.progression !== undefined ? { aiProgressionCard: input.progression } : {}),
      ...(input.treatmentAndLifestyle !== undefined ? { aiLifestyleGuide: input.treatmentAndLifestyle } : {}),
    },
  });
}

// includeInactive=false(기본값)면 소프트삭제된 기록은 제외한다(listExaminations와 동일
// 원칙) — 검사 목록의 "비활성 항목 보기" 토글에서만 true로 호출.
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

// 소프트 삭제 — deleteBodyCompositionRecord/deleteStrengthTestRecord와 동일한 권한 원칙
// (별도 제한 없음, Visit 삭제와 동일 신뢰 모델).
export async function deleteHrvTestRecord(id: number) {
  return prisma.hrvTestRecord.update({ where: { id }, data: { isActive: false } });
}
