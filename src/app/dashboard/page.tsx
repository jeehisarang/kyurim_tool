"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "./page.module.css";
import GoalTracker, { type Goal } from "./GoalTracker";
import { GOAL_METRICS, type MetricKey } from "@/lib/goals";

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

  const refreshGoals = useCallback(() => {
    fetch("/api/goals")
      .then((res) => res.json())
      .then(setGoals);
  }, []);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then(setStats);
    refreshGoals();
  }, [refreshGoals]);

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
      <h1 className={styles.pageTitle}>통계 대시보드</h1>

      {!stats ? (
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
                    <td>{c.categoryName}</td>
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
