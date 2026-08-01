"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import GoalTracker, { type Goal } from "./GoalTracker";
import { GOAL_METRICS, type MetricKey } from "@/lib/goals";
import CategoryBadge from "@/components/CategoryBadge";
import PeriodSelect from "@/components/PeriodSelect";
import { DEFAULT_STATS_PERIOD, type StatsPeriod } from "@/lib/stats-period";

type CategoryStat = { categoryId: number; categoryName: string; patientCount: number };
type DashboardStats = {
  totalPatients: number;
  visitsPerCategory: CategoryStat[];
  todayReservationRate: number;
  last7DaysAvgReservationRate: number;
  last7DaysAvgVisitsPerDay: number;
  visitsPerPatient: number;
  sevenDayRevisitRate: number;
  threeVisitFirstVisitRate: number;
  snapshotAt: string | null;
};

type DailyStat = {
  date: string;
  day: number;
  visitCount: number;
  reservationRate: number | null;
};

type MonthlyPatientTrendPoint = {
  month: string; // YYYY-MM
  newPatients: number;
  cumulativeTotal: number;
};

type PeriodStats = {
  reservationRate: number;
  visitsPerPatient: number;
  linkClickThroughRate: number;
  linkCount: number;
};

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatCount(value: number): string {
  return value.toFixed(1);
}

function formatSnapshotAt(iso: string | null): string {
  if (!iso) return "실시간 계산";
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `최종 업데이트: ${mm}/${dd} ${hh}:${mi}`;
}

function getCurrentValue(stats: DashboardStats, key: MetricKey): number {
  switch (key) {
    case "totalPatients":
      return stats.totalPatients;
    case "reservationRate":
      return stats.last7DaysAvgReservationRate;
    case "visitsPerPatient":
      return stats.visitsPerPatient;
    case "revisit7Day":
      return stats.sevenDayRevisitRate;
    case "initialVisit3Plus":
      return stats.threeVisitFirstVisitRate;
  }
}

function StatCard({
  label,
  value,
  headerRight,
  caption,
  children,
}: {
  label: string;
  value: string;
  headerRight?: React.ReactNode;
  caption?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.statCard}>
      {headerRight ? (
        <div className={styles.statCardHeaderRow}>
          <span className={styles.statLabel}>{label}</span>
          {headerRight}
        </div>
      ) : null}
      <div className={styles.statValue}>{value}</div>
      {!headerRight ? <div className={styles.statLabel}>{label}</div> : null}
      {caption ? <div className={styles.cardCaption}>{caption}</div> : null}
      {children}
    </div>
  );
}

function usePeriodStats(period: StatsPeriod) {
  const [data, setData] = useState<PeriodStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dashboard/period?period=${period}`)
      .then((res) => {
        if (!res.ok) throw new Error("dashboard/period 응답 실패");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  return data;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [daily, setDaily] = useState<DailyStat[] | null>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyPatientTrendPoint[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // 예약율/인당내원수/링크클릭률 카드는 기간선택 드롭다운을 각자 독립적으로 갖는다
  // (task2.md — "예약율은 30일, 인당내원수는 7일 이렇게 따로 볼 수 있어야 함").
  const [reservationPeriod, setReservationPeriod] = useState<StatsPeriod>(DEFAULT_STATS_PERIOD);
  const [visitsPerPatientPeriod, setVisitsPerPatientPeriod] = useState<StatsPeriod>(DEFAULT_STATS_PERIOD);
  const [linkClickPeriod, setLinkClickPeriod] = useState<StatsPeriod>(DEFAULT_STATS_PERIOD);

  const reservationPeriodStats = usePeriodStats(reservationPeriod);
  const visitsPerPatientPeriodStats = usePeriodStats(visitsPerPatientPeriod);
  const linkClickPeriodStats = usePeriodStats(linkClickPeriod);

  const refreshGoals = useCallback(() => {
    fetch("/api/goals")
      .then((res) => {
        if (!res.ok) throw new Error("goals 응답 실패");
        return res.json();
      })
      .then(setGoals)
      .catch(() => setLoadError(true));
  }, []);

  // 요청이 실패하면(네트워크 순단, 서버 재시작 타이밍 등) "불러오는 중"에서 영원히
  // 멈추지 않도록 반드시 에러 상태로 빠져나가게 한다 — 실사용 중 발견된 문제: 에러
  // 처리가 없으면 실패한 fetch 하나 때문에 새로고침 전까지 화면이 복구되지 않았다.
  useEffect(() => {
    setLoadError(false);
    fetch("/api/dashboard")
      .then((res) => {
        if (!res.ok) throw new Error("dashboard 응답 실패");
        return res.json();
      })
      .then(setStats)
      .catch(() => setLoadError(true));
    fetch("/api/dashboard/daily")
      .then((res) => {
        if (!res.ok) throw new Error("dashboard/daily 응답 실패");
        return res.json();
      })
      .then((data) => setDaily(data.daily))
      .catch(() => setLoadError(true));
    fetch("/api/dashboard/monthly-patients")
      .then((res) => {
        if (!res.ok) throw new Error("dashboard/monthly-patients 응답 실패");
        return res.json();
      })
      .then(setMonthlyTrend)
      .catch(() => setLoadError(true));
    refreshGoals();
  }, [refreshGoals, retryKey]);

  function goalFor(key: MetricKey): Goal | null {
    return goals?.find((g) => g.metricKey === key) ?? null;
  }

  function renderGoalTracker(key: MetricKey) {
    if (!stats || !goals) return null;
    const metric = GOAL_METRICS.find((m) => m.key === key)!;
    return (
      <GoalTracker
        metric={metric}
        currentValue={getCurrentValue(stats, key)}
        goal={goalFor(key)}
        onSaved={refreshGoals}
      />
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>통계 대시보드</h1>
        {stats ? <span className={styles.snapshotNote}>{formatSnapshotAt(stats.snapshotAt)}</span> : null}
      </div>

      {loadError && !stats ? (
        <div className={styles.errorBox}>
          <p>화면을 불러오지 못했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.</p>
          <button type="button" onClick={() => setRetryKey((k) => k + 1)}>
            다시 시도
          </button>
        </div>
      ) : !stats ? (
        <p className={styles.muted}>불러오는 중...</p>
      ) : (
        <>
          <div className={styles.cardGrid}>
            <StatCard
              label="예약율"
              value={
                reservationPeriodStats ? formatPercent(reservationPeriodStats.reservationRate) : "-"
              }
              headerRight={<PeriodSelect value={reservationPeriod} onChange={setReservationPeriod} />}
            >
              {renderGoalTracker("reservationRate")}
            </StatCard>
            <StatCard
              label="일평균 내원수 (최근 7일)"
              value={`${formatCount(stats.last7DaysAvgVisitsPerDay)}건`}
            />
            <StatCard
              label="인당 내원수"
              value={
                visitsPerPatientPeriodStats
                  ? `${formatCount(visitsPerPatientPeriodStats.visitsPerPatient)}회`
                  : "-"
              }
              headerRight={
                <PeriodSelect value={visitsPerPatientPeriod} onChange={setVisitsPerPatientPeriod} />
              }
            >
              {renderGoalTracker("visitsPerPatient")}
            </StatCard>
            <StatCard
              label="링크 클릭률"
              value={
                linkClickPeriodStats ? formatPercent(linkClickPeriodStats.linkClickThroughRate) : "-"
              }
              headerRight={<PeriodSelect value={linkClickPeriod} onChange={setLinkClickPeriod} />}
              caption="근사치: 링크 생성 후 열람 비율"
            />
          </div>

          <div className={styles.section}>
            <div className={styles.chartHeaderRow}>
              <div className={styles.sectionTitle}>월별 신규·누적 환자수</div>
              <span className={styles.goalRowValue}>전체 등록환자수 {stats.totalPatients}명</span>
            </div>
            <div className={styles.chartGoalWrap}>{renderGoalTracker("totalPatients")}</div>
            {!monthlyTrend ? (
              <p className={styles.muted}>불러오는 중...</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={monthlyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(110, 148, 140, 0.2)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: "var(--color-ink)" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="newCount"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "var(--color-ink)" }}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                  />
                  <YAxis
                    yAxisId="cumulative"
                    orientation="right"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "var(--color-ink)" }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    formatter={(value, name) =>
                      name === "cumulativeTotal" ? [`${value}명`, "누적환자수"] : [`${value}명`, "신규환자수"]
                    }
                    labelFormatter={(month) => month}
                  />
                  <Bar
                    yAxisId="newCount"
                    dataKey="newPatients"
                    name="신규환자수"
                    fill="rgba(110, 148, 140, 0.55)"
                    radius={[2, 2, 0, 0]}
                  />
                  <Line
                    yAxisId="cumulative"
                    type="monotone"
                    dataKey="cumulativeTotal"
                    name="누적환자수"
                    stroke="var(--color-seal)"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>이번달 일별 내원수·예약율 추이</div>
            {!daily ? (
              <p className={styles.muted}>불러오는 중...</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart
                  data={daily.map((d) => ({
                    day: d.day,
                    visitCount: d.visitCount,
                    reservationRatePercent:
                      d.reservationRate === null ? null : Math.round(d.reservationRate * 1000) / 10,
                  }))}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgba(110, 148, 140, 0.2)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 12, fill: "var(--color-ink)" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="count"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "var(--color-ink)" }}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                  />
                  <YAxis
                    yAxisId="rate"
                    orientation="right"
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 12, fill: "var(--color-ink)" }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    formatter={(value, name) =>
                      name === "reservationRatePercent"
                        ? [`${value}%`, "예약율"]
                        : [`${value}건`, "내원수"]
                    }
                    labelFormatter={(day) => `${day}일`}
                  />
                  <Bar
                    yAxisId="count"
                    dataKey="visitCount"
                    name="내원수"
                    fill="rgba(110, 148, 140, 0.55)"
                    radius={[2, 2, 0, 0]}
                  />
                  <Line
                    yAxisId="rate"
                    type="monotone"
                    dataKey="reservationRatePercent"
                    name="예약율"
                    stroke="var(--color-seal)"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>진료분야별 환자수</div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>진료분야</th>
                  <th>환자수</th>
                </tr>
              </thead>
              <tbody>
                {stats.visitsPerCategory.map((c) => (
                  <tr key={c.categoryId}>
                    <td>
                      <CategoryBadge id={c.categoryId} name={c.categoryName} />
                    </td>
                    <td className={styles.mono}>{c.patientCount}명</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>재방문 / 초진 지표</div>

            <div className={styles.goalRow}>
              <div className={styles.goalRowHeader}>
                <span>7일 재방문율</span>
                <span className={styles.goalRowValue}>
                  {formatPercent(stats.sevenDayRevisitRate)}
                </span>
              </div>
              {renderGoalTracker("revisit7Day")}
            </div>

            <div className={styles.goalRow}>
              <div className={styles.goalRowHeader}>
                <span>3회 이상 내원한 초진 환자 비율</span>
                <span className={styles.goalRowValue}>
                  {formatPercent(stats.threeVisitFirstVisitRate)}
                </span>
              </div>
              {renderGoalTracker("initialVisit3Plus")}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
