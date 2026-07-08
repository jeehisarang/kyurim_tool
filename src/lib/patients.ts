// 차트번호는 숫자만 허용 — 신규 등록/수정 양쪽에서 공유하는 검증 기준.
const CHART_NUMBER_PATTERN = /^[0-9]+$/;

export function isValidChartNumber(value: string): boolean {
  return CHART_NUMBER_PATTERN.test(value);
}

export const CHART_NUMBER_FORMAT_ERROR = "차트번호는 숫자만 입력할 수 있습니다.";
