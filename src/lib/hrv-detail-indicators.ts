// HRV 상세지표(TP/VLF/LF/HF/LF·HF비율/SDNN/RMSSD) 참고범위 시각화 전용(task.md "상세지표
// 시각화 + 이상치만 코멘트"). 이 지표들의 "참고범위"는 학술 표준이 아니라 기기 제조사
// 해석 레이어라는 기존 원칙(7/17 확정, hrv-explanation.ts의 자율신경균형도/맥박다양성과
// 동일 성격)을 그대로 따라 화면 표현은 "정상범위"가 아니라 "참고범위"로 통일한다.
//
// 아래 수치는 이번 작업 지시(task.md)가 참고한 자료(출처 불명확) 기준의 임시값이다 —
// 원장 검수 대기 상태(HRV_DETAIL_REFERENCE_RANGES_PENDING_REVIEW). 기존에 저장된 참고범위
// (설정 > 검사 학술근거 관리, ExamAcademicGuide)를 조사했으나 이 8개 지표에 대한 구조화된
// 수치는 어디에도 없었다(ExamAcademicGuide.content는 자유 텍스트, tcmPatternMapJson은
// 증상-패턴 매핑용이라 무관) — 그래서 아래 값을 그대로 임시 반영했다.
export const HRV_DETAIL_REFERENCE_RANGES_PENDING_REVIEW = true;

// task.md가 요청한 8개 지표 중 "맥박변화도(Pulse Diversity)"는 HrvTestRecord에 저장된
// 컬럼이 없다(자율신경균형도 이미지 판독 시점에만 비전 모델이 즉석 계산해 AI 프롬프트
// 텍스트에만 녹아들고 DB에 저장되지 않음, hrv-explanation.ts의 readAutonomicBalance 참고).
// task.md 4번("HrvTestRecord에 이미 저장된 7개 상세지표 컬럼을 그대로 사용 — 스키마 변경
// 없음")과 상충하므로, 이번 라운드는 실제로 저장된 7개 지표만 다루고 맥박변화도는 제외했다
// (스키마 변경 없이는 반영 불가 — 완료보고에 별도 명시).
export type HrvDetailIndicatorKey = "tp" | "vlf" | "lf" | "hf" | "lfHfRatio" | "sdnn" | "rmssd";

export type HrvDetailIndicatorDef = {
  key: HrvDetailIndicatorKey;
  label: string;
  subtitle: string;
  min: number;
  max: number;
};

export const HRV_DETAIL_INDICATORS: HrvDetailIndicatorDef[] = [
  { key: "tp", label: "Total Power", subtitle: "전체 활동량", min: 7.4, max: 9.3 },
  { key: "vlf", label: "VLF", subtitle: "장기 회복력", min: 6.8, max: 8.8 },
  { key: "lf", label: "LF", subtitle: "자율조절 능력", min: 6.1, max: 8.1 },
  { key: "hf", label: "HF", subtitle: "휴식·회복 능력", min: 4.2, max: 7.4 },
  { key: "lfHfRatio", label: "LF/HF 비율", subtitle: "교감·부교감 균형", min: 0.4, max: 2.2 },
  { key: "sdnn", label: "SDNN", subtitle: "전반적 회복력", min: 31.2, max: 100.9 },
  { key: "rmssd", label: "RMSSD", subtitle: "부교감 회복능력", min: 16, max: 74 },
];

export function isWithinReferenceRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

// 참고범위 이탈 시에만 코멘트 문구를 만든다(코드 레벨 결정론적 계산 — computeNotableChanges와
// 동일 원칙, AI가 판정하지 않음). 범위 안이면 null(침묵 — task.md "정상은 조용히").
export function buildDetailIndicatorComment(value: number, min: number, max: number): string | null {
  if (isWithinReferenceRange(value, min, max)) return null;
  const direction = value > max ? "높은" : "낮은";
  return `참고범위(${min}~${max})보다 다소 ${direction} 편으로 확인됩니다`;
}
