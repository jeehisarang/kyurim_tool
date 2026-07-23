// 마감설문 4문항 중 "변화"(다중선택) 원문(task2.md) — /refer/exit/[prescriptionId] 체크박스와
// 저장 형식(JSON 배열 문자열)이 이 목록을 공유한다. "기타" 선택 시 별도 컬럼 없이 사용자가
// 입력한 텍스트를 배열에 그대로 담아 저장한다(bodyType과 달리 Other 전용 컬럼이 스키마에 없음).
export const CHANGE_OPTIONS = [
  "식욕 감소",
  "붓기 감소",
  "속 편해짐",
  "몸 가벼워짐",
  "배변 편해짐",
  "폭식 줄어듦",
  "큰 변화 모르겠다",
] as const;

export const CHANGE_OTHER_VALUE = "기타";

// ExitSurveyResponse.compliance/consultInterest 컬럼 주석(schema.prisma)에 명시된 값 그대로.
export const COMPLIANCE_OPTIONS = ["매일복용", "1~2회놓침", "거의못함"] as const;
export type ComplianceValue = (typeof COMPLIANCE_OPTIONS)[number];

export const CONSULT_INTEREST_OPTIONS = ["네", "고민중", "아니오"] as const;
export type ConsultInterestValue = (typeof CONSULT_INTEREST_OPTIONS)[number];

/** JSON 배열 문자열을 파싱한다 — 형식이 깨졌으면 빈 배열(화면이 죽지 않도록 방어). */
export function parseChanges(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    // 파싱 실패 시 빈 배열로 취급
  }
  return [];
}
