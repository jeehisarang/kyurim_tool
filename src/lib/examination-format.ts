import { computeBmi, computeGripAgeTrend, GRIP_AGE_OUT_OF_RANGE_LABEL, type GripAgeOutOfRange, type GripAgeTrend } from "@/lib/exam-thresholds";

// /examinations 목록과 /examinations/patient/[patientId] 이력화면이 공유하는 검사기록
// 표시 포맷 — 중복 구현 지양(TodoTaskTable의 buildTaskRows와 동일한 원칙).
export type ExaminationRow =
  | {
      id: number;
      examType: "BODY_COMPOSITION";
      patient: { id: number; name: string; chartNumber: string; height: number | null };
      examDate: string;
      staffUserName: string;
      weightKg: number;
      bodyFatPercent: number;
      whr: number;
      smi: number | null;
      smiJudgement: "NORMAL" | "SARCOPENIA" | null;
      note: string | null;
      isActive: boolean;
    }
  | {
      id: number;
      examType: "STRENGTH_TEST";
      patient: { id: number; name: string; chartNumber: string };
      examDate: string;
      staffUserName: string;
      gripAvgKg: number;
      gripJudgement: "WEAK" | "NORMAL" | "STRONG" | "UNKNOWN";
      estimatedGripAge: number | null;
      gripAgeOutOfRange: GripAgeOutOfRange | null;
      isActive: boolean;
    }
  | {
      id: number;
      examType: "HRV";
      patient: { id: number; name: string; chartNumber: string };
      examDate: string;
      staffUserName: string;
      vascularHealthIndex: number;
      vascularHealthType: string;
      avgPulse: number;
      // 유비오맥파 CSV 자동연동(task.md) — "혈관건강도 측정"만 한 행은 null.
      stressIndex: number | null;
      sourceImagePath: string;
      isActive: boolean;
    };

export const EXAM_TYPE_LABEL = {
  BODY_COMPOSITION: "인바디",
  STRENGTH_TEST: "근력검사",
  HRV: "HRV",
};

export const SMI_JUDGEMENT_LABEL: Record<string, string> = {
  NORMAL: "정상",
  SARCOPENIA: "근감소증 의심",
};

export const GRIP_JUDGEMENT_LABEL: Record<string, string> = {
  WEAK: "약함",
  NORMAL: "정상",
  STRONG: "강함",
  UNKNOWN: "판정불가",
};

export const GRIP_AGE_TREND_LABEL: Record<GripAgeTrend, string> = {
  IMPROVED: "개선 ↓",
  MAINTAINED: "유지 →",
  WORSENED: "악화 ↑",
};

export function formatExamDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export function weightCell(row: ExaminationRow): string {
  return row.examType === "BODY_COMPOSITION" ? `${row.weightKg}kg` : "-";
}

export function bmiCell(row: ExaminationRow): string {
  if (row.examType !== "BODY_COMPOSITION" || row.patient.height == null) return "-";
  return computeBmi(row.weightKg, row.patient.height).toFixed(1);
}

export function bodyFatCell(row: ExaminationRow): string {
  return row.examType === "BODY_COMPOSITION" ? `${row.bodyFatPercent}%` : "-";
}

export function whrCell(row: ExaminationRow): string {
  return row.examType === "BODY_COMPOSITION" ? String(row.whr) : "-";
}

export function smiLabel(row: ExaminationRow): string {
  if (row.examType !== "BODY_COMPOSITION") return "-";
  if (row.smi == null) return "-";
  const judgement = row.smiJudgement ? ` (${SMI_JUDGEMENT_LABEL[row.smiJudgement]})` : "";
  return `${row.smi.toFixed(2)}${judgement}`;
}

export function gripLabel(row: ExaminationRow): string {
  if (row.examType !== "STRENGTH_TEST") return "-";
  return `${row.gripAvgKg.toFixed(1)}kg (${GRIP_JUDGEMENT_LABEL[row.gripJudgement]})`;
}

export function gripAgeLabel(row: ExaminationRow): string {
  if (row.examType !== "STRENGTH_TEST") return "-";
  if (row.gripAgeOutOfRange) return GRIP_AGE_OUT_OF_RANGE_LABEL[row.gripAgeOutOfRange];
  return `${row.estimatedGripAge}세`;
}

export function rowKey(row: ExaminationRow): string {
  return `${row.examType}-${row.id}`;
}

export function isSmiConcerning(row: ExaminationRow): boolean {
  return row.examType === "BODY_COMPOSITION" && row.smiJudgement === "SARCOPENIA";
}

// HRV(자율신경맥파기) 요약 — 판정 계산 로직 없이 기기가 이미 낸 값 그대로 표시(task2.md).
// stressIndex가 null(유비오맥파 CSV 자동연동, task.md — "혈관건강도 측정"만 한 행)이면
// "스트레스 -"로 표시해 값이 0이나 누락된 게 아니라 애초에 측정을 안 했음을 드러낸다.
export function hrvSummaryLabel(row: ExaminationRow): string {
  if (row.examType !== "HRV") return "-";
  const stress = row.stressIndex === null ? "-" : row.stressIndex;
  return `혈관건강지수 ${row.vascularHealthIndex}(${row.vascularHealthType}) · 맥박 ${row.avgPulse} · 스트레스 ${stress}`;
}

/**
 * 같은 환자의 근력검사 기록을 examDate 내림차순(최신 먼저)으로 순서대로 순회하며, 바로
 * 다음(=시간상 직전) 기록과 비교한 근력나이 추이를 계산한다. rows가 이미 examDate
 * 내림차순으로 정렬돼 있어야 한다.
 */
export function computeGripAgeTrendMap(
  rows: ExaminationRow[],
  groupByPatient: boolean,
): Map<string, GripAgeTrend> {
  const map = new Map<string, GripAgeTrend>();

  const byPatient = new Map<number, Extract<ExaminationRow, { examType: "STRENGTH_TEST" }>[]>();
  for (const row of rows) {
    if (row.examType !== "STRENGTH_TEST") continue;
    const key = groupByPatient ? row.patient.id : 0;
    const list = byPatient.get(key) ?? [];
    list.push(row);
    byPatient.set(key, list);
  }

  for (const list of byPatient.values()) {
    for (let i = 0; i < list.length - 1; i++) {
      const current = list[i];
      const previous = list[i + 1];
      const trend = computeGripAgeTrend(
        { estimatedAge: current.estimatedGripAge, outOfRange: current.gripAgeOutOfRange },
        { estimatedAge: previous.estimatedGripAge, outOfRange: previous.gripAgeOutOfRange },
      );
      map.set(rowKey(current), trend);
    }
  }
  return map;
}
