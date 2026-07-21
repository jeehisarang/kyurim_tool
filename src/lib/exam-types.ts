// 검사종류 단일 소스(task2.md) — 이전엔 /examinations 필터탭·"연결검사" 드롭다운·표시
// 라벨이 각자 하드코딩되어 있어 HRV 추가가 한쪽에만 반영되는 문제가 있었다. 새 검사종류가
// 생기면 이 배열에만 추가하면 필터탭/드롭다운/라벨 표시가 전부 자동으로 같이 늘어난다.
// prisma 등 서버 전용 의존성이 없어 클라이언트 컴포넌트에서도 그대로 import할 수 있다.
export const EXAM_TYPES = [
  { key: "BODY_COMPOSITION", label: "인바디", displayOrder: 1 },
  { key: "STRENGTH_TEST", label: "근력검사", displayOrder: 2 },
  { key: "HRV", label: "자율신경맥파(HRV)", displayOrder: 3 },
] as const;

export type ExamType = (typeof EXAM_TYPES)[number]["key"];

export const EXAM_TYPE_LABEL: Record<ExamType, string> = Object.fromEntries(
  EXAM_TYPES.map((e) => [e.key, e.label]),
) as Record<ExamType, string>;

export function isExamType(value: unknown): value is ExamType {
  return EXAM_TYPES.some((e) => e.key === value);
}
