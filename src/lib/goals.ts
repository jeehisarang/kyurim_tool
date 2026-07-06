export type MetricKey =
  | "totalPatients"
  | "reservationRate"
  | "visitsPerPatient"
  | "revisit7Day"
  | "initialVisit3Plus";

export type PeriodType = "weekly" | "monthly";

export type GoalMetricConfig = {
  key: MetricKey;
  label: string;
  unit: string;
  isPercent: boolean;
};

// 진료분야별 환자수는 항목이 가변적이라 이번 단계 목표 설정 대상에서 제외
export const GOAL_METRICS: GoalMetricConfig[] = [
  { key: "totalPatients", label: "누적환자수", unit: "명", isPercent: false },
  { key: "reservationRate", label: "예약율 (최근 7일 평균)", unit: "%", isPercent: true },
  { key: "visitsPerPatient", label: "인당 내원수", unit: "회", isPercent: false },
  { key: "revisit7Day", label: "7일 재방문율", unit: "%", isPercent: true },
  { key: "initialVisit3Plus", label: "3회 이상 내원한 초진 환자 비율", unit: "%", isPercent: true },
];

export const GOAL_METRIC_KEYS = GOAL_METRICS.map((m) => m.key) as MetricKey[];

export function isValidMetricKey(value: string): value is MetricKey {
  return (GOAL_METRIC_KEYS as string[]).includes(value);
}

export function isValidPeriodType(value: string): value is PeriodType {
  return value === "weekly" || value === "monthly";
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Monday of the calendar week containing `date`. */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** First day of the calendar month containing `date`. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function periodStartFor(periodType: PeriodType, now: Date = new Date()): Date {
  return periodType === "weekly" ? startOfWeek(now) : startOfMonth(now);
}
