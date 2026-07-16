import { computeBmi, gripAgePatientMessage, type GripAgeOutOfRange } from "@/lib/exam-thresholds";
import {
  judgeVascularHealthIndex,
  judgeAvgPulse,
  judgeStressIndex,
  judgeVascularHealthType,
  type HrvSeverity,
} from "@/lib/hrv-thresholds";
import type { ExaminationRow } from "@/lib/examination-format";

// "환자와 함께보기"(/patient-view/exam/[examType]/[id]) 전용 화이트리스트 변환 —
// 원본 API 응답에 측정자/메모/처방 연결/수정이력 등 직원 전용 필드가 섞여 있어도, 여기서
// 새 객체를 필드 단위로 "허용 목록만" 다시 조립하기 때문에 실수로 새어나갈 수 없다.
// 근감소증처럼 딱딱한 진단 용어는 환자 앞에서 보여주기 부담스러워 부드러운 표현으로 순화한다.

const SMI_PATIENT_LABEL: Record<string, string> = {
  NORMAL: "양호합니다",
  SARCOPENIA: "근육량 보강이 도움이 되겠습니다",
};

export type PatientSafeBodyComposition = {
  examType: "BODY_COMPOSITION";
  examDate: string;
  weightKg: number;
  bmi: number | null;
  bodyFatPercent: number;
  whr: number;
  smi: number | null;
  smiPatientLabel: string | null;
  // AI 해설 코멘트(task.md) — 과거 레코드는 null일 수 있고, 그 경우 화면에서 즉석 생성 요청.
  aiExplanation: string | null;
};

export type PatientSafeStrengthTest = {
  examType: "STRENGTH_TEST";
  examDate: string;
  gripLeftKg: number;
  gripRightKg: number;
  gripAvgKg: number;
  gripJudgementLabel: string;
  gripAgeMessage: string;
  aiExplanation: string | null;
};

export type PatientSafeExamView = PatientSafeBodyComposition | PatientSafeStrengthTest;

const GRIP_JUDGEMENT_LABEL: Record<string, string> = {
  WEAK: "약함",
  NORMAL: "정상",
  STRONG: "강함",
  UNKNOWN: "판정불가",
};

type RawBodyCompositionDetail = {
  examType: "BODY_COMPOSITION";
  examDate: string;
  weightKg: number;
  bodyFatPercent: number;
  whr: number;
  smi: number | null;
  smiJudgement: "NORMAL" | "SARCOPENIA" | null;
  patient: { height: number | null };
  aiExplanation: string | null;
};

type RawStrengthTestDetail = {
  examType: "STRENGTH_TEST";
  examDate: string;
  gripLeftKg: number;
  gripRightKg: number;
  gripAvgKg: number;
  gripJudgement: "WEAK" | "NORMAL" | "STRONG" | "UNKNOWN";
  estimatedGripAge: number | null;
  gripAgeOutOfRange: GripAgeOutOfRange | null;
  aiExplanation: string | null;
};

export function toPatientSafeExamView(
  detail: RawBodyCompositionDetail | RawStrengthTestDetail,
): PatientSafeExamView {
  if (detail.examType === "BODY_COMPOSITION") {
    return {
      examType: "BODY_COMPOSITION",
      examDate: detail.examDate,
      weightKg: detail.weightKg,
      bmi: detail.patient.height != null ? computeBmi(detail.weightKg, detail.patient.height) : null,
      bodyFatPercent: detail.bodyFatPercent,
      whr: detail.whr,
      smi: detail.smi,
      smiPatientLabel: detail.smiJudgement ? SMI_PATIENT_LABEL[detail.smiJudgement] : null,
      aiExplanation: detail.aiExplanation,
    };
  }

  return {
    examType: "STRENGTH_TEST",
    examDate: detail.examDate,
    gripLeftKg: detail.gripLeftKg,
    gripRightKg: detail.gripRightKg,
    gripAvgKg: detail.gripAvgKg,
    gripJudgementLabel: GRIP_JUDGEMENT_LABEL[detail.gripJudgement],
    gripAgeMessage: gripAgePatientMessage(detail.estimatedGripAge, detail.gripAgeOutOfRange),
    aiExplanation: detail.aiExplanation,
  };
}

// "환자와 함께보기"(/patient-view/exam/hrv/[id], task2.md) 전용 화이트리스트 변환 —
// measuredByStaff 등 직원 전용 필드는 여기서 아예 조립하지 않는다.
// 4단 구조 AI 코멘트(task.md) — 신규 레코드는 이 필드들에 저장된다. 과거 레코드(레거시
// aiCommentary만 있음)는 sections가 null이고 legacyCommentary만 채워지며, 화면이 그 경우
// 하나의 문단 블록으로 폴백 표시한다(회귀 방지).
export type PatientSafeHrvSections = {
  deviceReading: string;
  clinicalMeaning: string;
  lifestyleGuide: string;
  tcmInterpretation: string;
};

export type PatientSafeHrvView = {
  testDate: string;
  vascularHealthIndex: number;
  vascularHealthType: string;
  avgPulse: number;
  // 유비오맥파 CSV 자동연동(task.md) — "스트레스 지수 측정"까지 안 한 행은 null. 화면은
  // "측정 안 함"으로 표시하고 색칠/AI 코멘트 언급을 건너뛴다.
  stressIndex: number | null;
  // 정상/경계/위험 색상강조용 판정(task2.md 기준, hrv-thresholds.ts) — 등급 문자를 못 알아보는
  // 과거 오기입 등은 vascularHealthTypeSeverity가 null이라 화면에서 색칠하지 않는다.
  vascularHealthIndexSeverity: HrvSeverity;
  avgPulseSeverity: HrvSeverity;
  stressIndexSeverity: HrvSeverity | null;
  vascularHealthTypeSeverity: HrvSeverity | null;
  sourceImagePath: string;
  // 2페이지(상세결과) — 없을 수 있다(과거 1장짜리 레코드, task.md).
  sourceImagePath2: string | null;
  sections: PatientSafeHrvSections | null;
  legacyCommentary: string | null;
  // "미병" 프롬프트 버전(task.md) — null이면 구버전 섹션 의미(기기판독요약 등), "MIBYEONG_V1"
  // 이면 신버전(미병도입 등)이라 화면이 라벨/순서를 이 값으로 구분해야 한다.
  commentaryVersion: string | null;
};

type RawHrvDetail = {
  testDate: string;
  vascularHealthIndex: number;
  vascularHealthType: string;
  avgPulse: number;
  stressIndex: number | null;
  sourceImagePath: string;
  sourceImagePath2?: string | null;
  aiCommentary: string | null;
  aiDeviceReading?: string | null;
  aiClinicalMeaning?: string | null;
  aiLifestyleGuide?: string | null;
  aiTcmInterpretation?: string | null;
  aiCommentaryVersion?: string | null;
};

export function toPatientSafeHrvView(detail: RawHrvDetail): PatientSafeHrvView {
  const sections: PatientSafeHrvSections | null = detail.aiDeviceReading
    ? {
        deviceReading: detail.aiDeviceReading,
        clinicalMeaning: detail.aiClinicalMeaning ?? "",
        lifestyleGuide: detail.aiLifestyleGuide ?? "",
        tcmInterpretation: detail.aiTcmInterpretation ?? "",
      }
    : null;

  return {
    testDate: detail.testDate,
    vascularHealthIndex: detail.vascularHealthIndex,
    vascularHealthType: detail.vascularHealthType,
    avgPulse: detail.avgPulse,
    stressIndex: detail.stressIndex,
    vascularHealthIndexSeverity: judgeVascularHealthIndex(detail.vascularHealthIndex),
    avgPulseSeverity: judgeAvgPulse(detail.avgPulse),
    stressIndexSeverity: judgeStressIndex(detail.stressIndex),
    vascularHealthTypeSeverity: judgeVascularHealthType(detail.vascularHealthType),
    sourceImagePath: detail.sourceImagePath,
    sourceImagePath2: detail.sourceImagePath2 ?? null,
    sections,
    legacyCommentary: sections ? null : detail.aiCommentary,
    commentaryVersion: detail.aiCommentaryVersion ?? null,
  };
}

// "환자 검사 종합 리포트"(/patient-view/exam-report/[patientId], 14-6) 전용 —
// 검사종류별로 몇 건 있는지에 따라 화면에서 무엇을 보여줘야 하는지만 판단한다(순수 함수).
// - 0건: 섹션 자체를 숨김
// - 1건: 기존 개별 검사 상세 화이트리스트 뷰(toPatientSafeExamView)를 그대로 재사용해
//   가장 자세한 단일 결과를 보여준다(좌/우 악력 등 목록 API에는 없는 필드가 필요해서,
//   호출측이 해당 id로 상세 API를 한 번 더 불러 변환해야 한다).
// - 2건 이상: 목록 API 필드만으로 충분한 추이 그래프를 그린다(좌/우 악력 등 상세 불필요).
export type ExamReportPlan = {
  bodyComposition:
    | { kind: "none" }
    | { kind: "single"; id: number }
    | { kind: "trend"; points: { examDate: string; weightKg: number; bodyFatPercent: number }[] };
  strengthTest:
    | { kind: "none" }
    | { kind: "single"; id: number }
    | {
        kind: "trend";
        points: { examDate: string; gripAvgKg: number; estimatedGripAge: number | null }[];
      };
};

export function planPatientExamReport(rows: ExaminationRow[]): ExamReportPlan {
  const bodyRows = rows.filter(
    (r): r is Extract<ExaminationRow, { examType: "BODY_COMPOSITION" }> =>
      r.examType === "BODY_COMPOSITION",
  );
  const strengthRows = rows.filter(
    (r): r is Extract<ExaminationRow, { examType: "STRENGTH_TEST" }> =>
      r.examType === "STRENGTH_TEST",
  );

  // 차트가 왼쪽(과거)→오른쪽(최신)으로 시간순 진행하도록 오름차순 정렬.
  const bodySorted = [...bodyRows].sort((a, b) => a.examDate.localeCompare(b.examDate));
  const strengthSorted = [...strengthRows].sort((a, b) => a.examDate.localeCompare(b.examDate));

  const bodyComposition: ExamReportPlan["bodyComposition"] =
    bodySorted.length === 0
      ? { kind: "none" }
      : bodySorted.length === 1
        ? { kind: "single", id: bodySorted[0].id }
        : {
            kind: "trend",
            points: bodySorted.map((r) => ({
              examDate: r.examDate,
              weightKg: r.weightKg,
              bodyFatPercent: r.bodyFatPercent,
            })),
          };

  const strengthTest: ExamReportPlan["strengthTest"] =
    strengthSorted.length === 0
      ? { kind: "none" }
      : strengthSorted.length === 1
        ? { kind: "single", id: strengthSorted[0].id }
        : {
            kind: "trend",
            points: strengthSorted.map((r) => ({
              examDate: r.examDate,
              gripAvgKg: r.gripAvgKg,
              estimatedGripAge: r.estimatedGripAge,
            })),
          };

  return { bodyComposition, strengthTest };
}
