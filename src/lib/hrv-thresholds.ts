// HRV(자율신경맥파기) 환자용 화면 색상강조 전용 판정 기준(task2.md). 임상적으로 고정된
// 참고값이라 DB가 아닌 코드 상수로 관리한다(exam-thresholds.ts와 동일 원칙).
// 이번 범위는 4개 지표(혈관건강지수/평균맥박/스트레스지수/혈관건강도 등급)로 한정 —
// LF/HF/SDNN/RMSSD 등은 별도 이월 항목이라 여기 포함하지 않는다(task2.md).

export type HrvSeverity = "NORMAL" | "CAUTION" | "DANGER";

// 혈관건강지수: 낮을수록(음수일수록) 양호 — 상한선만 있고 하한선은 없다(task2.md).
export function judgeVascularHealthIndex(value: number): HrvSeverity {
  if (value <= 5) return "NORMAL";
  if (value <= 20) return "CAUTION";
  return "DANGER";
}

// 평균맥박: 원장님 지시로 3단계 경계색 없이 정상/비정상 2단계로만 단순화(task2.md) —
// 약물/운동선수/고령 등 변수 때문에 60~100 밖을 곧바로 "위험"으로 단정하지 않되, 색상은
// DANGER로 표시한다(문구상으로만 참고용 해석을 별도 제공하는 쪽은 화면단 책임).
export function judgeAvgPulse(value: number): Extract<HrvSeverity, "NORMAL" | "DANGER"> {
  return value >= 60 && value <= 100 ? "NORMAL" : "DANGER";
}

// 스트레스지수: 25 미만 정상 / 25~45 경계(일시적 25~35·초기 35~45) / 45 이상 위험(축적
// 45~60·만성 60 이상) — 이번 단계 색상은 3단계까지만 반영하고 세부 문구는 다루지 않는다.
// null(측정 안 함 — "혈관건강도 측정"만 하고 "스트레스 지수 측정"까지 안 한 경우, task.md
// 유비오맥파 CSV 자동연동)이면 판정 자체를 하지 않는다 — 화면이 색칠 없이 "측정 안 함"으로 표시.
export function judgeStressIndex(value: number | null): HrvSeverity | null {
  if (value === null) return null;
  if (value < 25) return "NORMAL";
  if (value < 45) return "CAUTION";
  return "DANGER";
}

// 혈관건강도 등급: 기기가 이미 A~G 문자로 출력하므로 별도 수치 계산 없이 문자만으로
// 3단계 매핑한다(task2.md). 알 수 없는 문자가 들어오면(과거 오기입 등) null — 화면에서
// 색칠하지 않고 값만 그대로 보여준다.
const VASCULAR_HEALTH_TYPE_SEVERITY: Record<string, HrvSeverity> = {
  A: "NORMAL",
  B: "NORMAL",
  C: "CAUTION",
  D: "CAUTION",
  E: "DANGER",
  F: "DANGER",
  G: "DANGER",
};

export function judgeVascularHealthType(grade: string): HrvSeverity | null {
  return VASCULAR_HEALTH_TYPE_SEVERITY[grade] ?? null;
}
