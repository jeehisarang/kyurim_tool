import { computeBmi, gripAgePatientMessage, type GripAgeOutOfRange } from "@/lib/exam-thresholds";

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
};

export type PatientSafeStrengthTest = {
  examType: "STRENGTH_TEST";
  examDate: string;
  gripLeftKg: number;
  gripRightKg: number;
  gripAvgKg: number;
  gripJudgementLabel: string;
  gripAgeMessage: string;
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
  };
}
