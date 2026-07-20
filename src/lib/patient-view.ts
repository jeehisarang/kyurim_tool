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

export type NotableChangeView = { label: string; direction: "IMPROVED" | "ATTENTION"; sentence: string };

// 건강 리포트(task.md 7카드 리뉴얼) 화이트리스트 뷰 — commentaryVersion이
// "HEALTH_REPORT_V1"일 때만 채워진다. 카드2(checkedSymptoms)/카드3(notableChanges)/
// 카드6(redFlagNotice)은 AI가 아니라 코드가 계산한 데이터를 그대로 옮긴 것이다.
// 카드7 치료방향 카드(task.md "환자용/원장용 분리") — doctorText(변증명+한자+방제 계열,
// 원장 확인화면 전용)와 patientText(전문용어 없는 환자용) 둘 다 담는다. 이 타입 자체는
// "전체" 뷰(원장 확인화면용)이고, 환자 노출 경로(toPatientSafeHrvView)는 아래
// PatientTreatmentCardView로 doctorText를 걸러낸 별도 타입을 쓴다 — 데이터 조립 단계에서
// 아예 안 만드는 화이트리스트 원칙(toPatientSafeExamView와 동일).
export type CategoryTreatmentCardView = { categoryCode: string; categoryLabel: string; doctorText: string; patientText: string };

// 카드4 상단 카테고리 비중 시각화 — 도넛+막대 조합(task.md). 후보 카테고리끼리만 원점수
// 합으로 재정규화한 값("기타" 없음, task.md — 체크리스트 전체 만점 대비 방식은 후보 수
// 적을 때 "기타"가 과도해져 비교 의미가 퇴색된다는 판단으로 폐기). AI가 안 만들고 코드가
// 계산한 값. 후보 카테고리가 없으면 slices 빈 배열(시각화 자체를 숨김).
export type CategoryShareSliceView = { categoryCode: string; categoryLabel: string; ratioPercent: number };
export type CategoryVisualizationView = { slices: CategoryShareSliceView[] };

export type HealthReportCards = {
  headline: string;
  checkedSymptoms: string[];
  notableChanges: NotableChangeView[];
  tcmInterpretation: string;
  progression: string;
  redFlagNotice: string | null;
  // 카드4 상단 시각화(task.md 도넛+막대). 옛 레코드(재생성 전)는 slices 빈 배열.
  categoryVisualization: CategoryVisualizationView;
  // 카드7 카드형 재구성 — 카테고리별 독립 카드(doctorText+patientText 둘 다 포함, 원장
  // 확인화면 전용 "전체" 뷰). 옛 레코드(재생성 전)는 항상 빈 배열.
  treatmentCards: CategoryTreatmentCardView[];
  // 카드7의 공통 생활관리 문단(카드형 재구성 이후로는 카테고리 치료원칙을 다루지 않음).
  treatmentAndLifestyle: string;
  // 클로징 헤드라인(task.md "미병 프레임 복원") — 원장용/환자용 공통 노출(변증명·한자 같은
  // 전문용어가 없는 문구라 분리 불필요). 옛 레코드(재생성 전)는 null(카드 숨김).
  closingHeadline: string | null;
};

// 환자 노출 경로 전용(task.md 화이트리스트) — doctorText 필드 자체가 없다(존재하지 않으니
// 실수로도 노출될 수 없음). toPatientSafeHealthReportCards가 여기로만 변환한다.
export type PatientTreatmentCardView = { categoryCode: string; categoryLabel: string; patientText: string };

export type PatientSafeHealthReportCards = Omit<HealthReportCards, "treatmentCards"> & {
  treatmentCards: PatientTreatmentCardView[];
};

/**
 * 원장 확인화면용 "전체" 카드7 데이터에서 doctorText를 제거해 환자 노출용으로 변환한다
 * (task.md — "환자가 보는 화면은 항상 환자용 버전만 노출, 원장용은 원장 확인화면에서만").
 * toPatientSafeHrvView가 이 함수를 거친 결과만 healthReport 필드에 담아 반환하므로,
 * /s/[token], /p/[token], 환자와 함께보기 팝업 등 환자가 접근하는 모든 경로의 API 응답
 * 자체에 doctorText가 아예 포함되지 않는다(단순히 화면에서 안 보여주는 게 아니라 네트워크
 * 페이로드 단계에서부터 제외).
 */
function toPatientSafeHealthReportCards(cards: HealthReportCards | null): PatientSafeHealthReportCards | null {
  if (!cards) return null;
  return {
    ...cards,
    treatmentCards: cards.treatmentCards.map((c) => ({
      categoryCode: c.categoryCode,
      categoryLabel: c.categoryLabel,
      patientText: c.patientText,
    })),
  };
}

function parseCheckedSymptomsJson(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => (p && typeof p === "object" && "patientQuestion" in p ? String((p as { patientQuestion: unknown }).patientQuestion) : null))
      .filter((s): s is string => s !== null);
  } catch {
    return [];
  }
}

// categoryCode/doctorText/patientText까지 전부 포함된 모양만 유효로 본다 — 이전 라운드
// 이하 모양({categoryCode,categoryLabel,body} 등)은 doctorText/patientText 필드가 없어
// 자연히 걸러진다(재생성 전까지 카드 미노출, 화면 안 깨짐).
function parseTreatmentCardsJson(json: string | null | undefined): CategoryTreatmentCardView[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is CategoryTreatmentCardView =>
        c &&
        typeof c === "object" &&
        typeof c.categoryCode === "string" &&
        typeof c.categoryLabel === "string" &&
        typeof c.doctorText === "string" &&
        typeof c.patientText === "string",
    );
  } catch {
    return [];
  }
}

function isValidShareSlice(v: unknown): v is CategoryShareSliceView {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof (v as Record<string, unknown>).categoryCode === "string" &&
    typeof (v as Record<string, unknown>).categoryLabel === "string" &&
    typeof (v as Record<string, unknown>).ratioPercent === "number"
  );
}

// 옛 모양(severeRatioPercent/mildRatioPercent 배열 등)은 slices 필드가 없어 파싱 실패 →
// 빈 시각화로 안전하게 폴백한다. 체크리스트 전체 만점 대비 방식(otherPercent 있던 직전
// 라운드) 레코드는 slices 구조 자체는 같아 그대로 파싱되지만 — 그 시절 계산된 퍼센트
// 값이라 재정규화 전 숫자가 남아있다(재생성 전까지, 기존 관례와 동일).
function parseCategoryVisualizationJson(json: string | null | undefined): CategoryVisualizationView {
  const empty: CategoryVisualizationView = { slices: [] };
  if (!json) return empty;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.slices)) {
      return empty;
    }
    return { slices: parsed.slices.filter(isValidShareSlice) };
  } catch {
    return empty;
  }
}

function parseNotableChangesJson(json: string | null | undefined): NotableChangeView[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is NotableChangeView =>
        c && typeof c === "object" && typeof c.label === "string" && typeof c.sentence === "string" &&
        (c.direction === "IMPROVED" || c.direction === "ATTENTION"),
    );
  } catch {
    return [];
  }
}

/** HEALTH_REPORT_V1 레코드의 raw DB 필드를 7카드 구조로 변환한다(staff 상세화면/환자화면 공용). */
export function toHealthReportCards(detail: {
  aiDeviceReading?: string | null;
  aiTcmInterpretation?: string | null;
  aiProgressionCard?: string | null;
  aiLifestyleGuide?: string | null;
  aiCheckedSymptomsJson?: string | null;
  aiClinicalMeaning?: string | null;
  aiRedFlagNotice?: string | null;
  aiTreatmentCardsJson?: string | null;
  aiCategoryScoreBarsJson?: string | null;
  aiClosingHeadline?: string | null;
}): HealthReportCards | null {
  if (!detail.aiDeviceReading) return null;
  return {
    headline: detail.aiDeviceReading,
    checkedSymptoms: parseCheckedSymptomsJson(detail.aiCheckedSymptomsJson),
    notableChanges: parseNotableChangesJson(detail.aiClinicalMeaning),
    tcmInterpretation: detail.aiTcmInterpretation ?? "",
    progression: detail.aiProgressionCard ?? "",
    redFlagNotice: detail.aiRedFlagNotice ?? null,
    categoryVisualization: parseCategoryVisualizationJson(detail.aiCategoryScoreBarsJson),
    treatmentCards: parseTreatmentCardsJson(detail.aiTreatmentCardsJson),
    treatmentAndLifestyle: detail.aiLifestyleGuide ?? "",
    closingHeadline: detail.aiClosingHeadline ?? null,
  };
}

export type PatientSafeHrvView = {
  testDate: string;
  vascularHealthIndex: number;
  vascularHealthType: string;
  avgPulse: number;
  // 유비오맥파 CSV 자동연동(task.md) — "스트레스 지수 측정"까지 안 한 행은 null. 화면은
  // "측정 안 함"으로 표시하고 색칠/AI 코멘트 언급을 건너뛴다.
  stressIndex: number | null;
  // 상세 HRV 지표(task.md "상세지표 시각화 + 이상치만 코멘트") — 순수 수치라 전문용어가
  // 없으므로 doctorText/patientText 분리 없이 원장/환자 화면에 그대로 노출한다(task.md 3번
  // 명시). 수동 등록 레코드는 항상 전부 null — HrvDetailIndicatorChart가 null이면 컴포넌트
  // 자체를 숨긴다.
  tp: number | null;
  vlf: number | null;
  lf: number | null;
  hf: number | null;
  lfHfRatio: number | null;
  sdnn: number | null;
  rmssd: number | null;
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
  // 건강 리포트(task.md 7카드) — commentaryVersion이 "HEALTH_REPORT_V1"일 때만 채워진다.
  // 카드7 treatmentCards는 환자용 화이트리스트(PatientTreatmentCardView, doctorText 없음).
  healthReport: PatientSafeHealthReportCards | null;
  legacyCommentary: string | null;
  // 코멘트 프롬프트 버전 — null이면 구버전 섹션 의미(기기판독요약 등), "MIBYEONG_V1"이면
  // "미병" 재설계, "HEALTH_REPORT_V1"이면 7카드 건강 리포트라 화면이 이 값으로 완전히 다른
  // 컴포넌트를 렌더링해야 한다.
  commentaryVersion: string | null;
};

type RawHrvDetail = {
  testDate: string;
  vascularHealthIndex: number;
  vascularHealthType: string;
  avgPulse: number;
  stressIndex: number | null;
  tp?: number | null;
  vlf?: number | null;
  lf?: number | null;
  hf?: number | null;
  lfHfRatio?: number | null;
  sdnn?: number | null;
  rmssd?: number | null;
  sourceImagePath: string;
  sourceImagePath2?: string | null;
  aiCommentary: string | null;
  aiDeviceReading?: string | null;
  aiClinicalMeaning?: string | null;
  aiLifestyleGuide?: string | null;
  aiTcmInterpretation?: string | null;
  aiProgressionCard?: string | null;
  aiCheckedSymptomsJson?: string | null;
  aiRedFlagNotice?: string | null;
  aiTreatmentCardsJson?: string | null;
  aiCategoryScoreBarsJson?: string | null;
  aiClosingHeadline?: string | null;
  aiCommentaryVersion?: string | null;
};

export function toPatientSafeHrvView(detail: RawHrvDetail): PatientSafeHrvView {
  const isHealthReport = detail.aiCommentaryVersion === "HEALTH_REPORT_V1";
  const sections: PatientSafeHrvSections | null =
    !isHealthReport && detail.aiDeviceReading
      ? {
          deviceReading: detail.aiDeviceReading,
          clinicalMeaning: detail.aiClinicalMeaning ?? "",
          lifestyleGuide: detail.aiLifestyleGuide ?? "",
          tcmInterpretation: detail.aiTcmInterpretation ?? "",
        }
      : null;
  const healthReport = isHealthReport ? toPatientSafeHealthReportCards(toHealthReportCards(detail)) : null;

  return {
    testDate: detail.testDate,
    vascularHealthIndex: detail.vascularHealthIndex,
    vascularHealthType: detail.vascularHealthType,
    avgPulse: detail.avgPulse,
    stressIndex: detail.stressIndex,
    tp: detail.tp ?? null,
    vlf: detail.vlf ?? null,
    lf: detail.lf ?? null,
    hf: detail.hf ?? null,
    lfHfRatio: detail.lfHfRatio ?? null,
    sdnn: detail.sdnn ?? null,
    rmssd: detail.rmssd ?? null,
    vascularHealthIndexSeverity: judgeVascularHealthIndex(detail.vascularHealthIndex),
    avgPulseSeverity: judgeAvgPulse(detail.avgPulse),
    stressIndexSeverity: judgeStressIndex(detail.stressIndex),
    vascularHealthTypeSeverity: judgeVascularHealthType(detail.vascularHealthType),
    sourceImagePath: detail.sourceImagePath,
    sourceImagePath2: detail.sourceImagePath2 ?? null,
    sections,
    healthReport,
    legacyCommentary: sections || healthReport ? null : detail.aiCommentary,
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
