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
};

type DailyStat = {
  date: string;
  day: number;
  visitCount: number;
  reservationRate: number | null;
};

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatCount(value: number): string {
  return value.toFixed(1);
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
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [daily, setDaily] = useState<DailyStat[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

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
            <StatCard label="누적환자수" value={`${stats.totalPatients}명`}>
              {renderGoalTracker("totalPatients")}
            </StatCard>
            <StatCard label="오늘 예약율" value={formatPercent(stats.todayReservationRate)} />
            <StatCard
              label="최근 7일 평균 예약율"
              value={formatPercent(stats.last7DaysAvgReservationRate)}
            >
              {renderGoalTracker("reservationRate")}
            </StatCard>
            <StatCard
              label="일평균 내원수 (최근 7일)"
              value={`${formatCount(stats.last7DaysAvgVisitsPerDay)}건`}
            />
            <StatCard label="인당 내원수" value={`${formatCount(stats.visitsPerPatient)}회`}>
              {renderGoalTracker("visitsPerPatient")}
            </StatCard>
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
