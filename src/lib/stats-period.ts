// 통계 대시보드 공용 기간선택(task2.md 결정1 진행순서 2 — 예약율/인당내원수/링크클릭률 공용).
// prisma를 건드리지 않는 순수 타입/상수만 둬서 "use client" 컴포넌트에서도 그대로 임포트할 수
// 있게 한다(goals.ts와 동일한 분리 원칙 — 서버 전용 stats.ts와는 별도 파일).
export type StatsPeriod = "7d" | "30d" | "thisMonth";

export const DEFAULT_STATS_PERIOD: StatsPeriod = "7d";

export const STATS_PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
  { value: "thisMonth", label: "이번달" },
];

export function isValidStatsPeriod(value: string): value is StatsPeriod {
  return value === "7d" || value === "30d" || value === "thisMonth";
}
