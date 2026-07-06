"use client";

import { useState } from "react";
import styles from "./page.module.css";
import SealStamp from "@/components/SealStamp";
import type { GoalMetricConfig, PeriodType } from "@/lib/goals";

export type Goal = {
  id: number;
  metricKey: string;
  periodType: string;
  periodStart: string;
  targetValue: number;
};

type Props = {
  metric: GoalMetricConfig;
  currentValue: number;
  goal: Goal | null;
  onSaved: () => void;
};

const PERIOD_LABEL: Record<PeriodType, string> = { weekly: "주간", monthly: "월간" };

function formatValue(metric: GoalMetricConfig, value: number): string {
  if (metric.key === "totalPatients") return `${Math.round(value)}`;
  return value.toFixed(1);
}

export default function GoalTracker({ metric, currentValue, goal, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
  const [inputValue, setInputValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stampKey, setStampKey] = useState(0);

  const currentDisplayValue = metric.isPercent ? currentValue * 100 : currentValue;

  function openForm() {
    setInputValue(goal ? String(goal.targetValue) : "");
    setPeriodType((goal?.periodType as PeriodType) ?? "weekly");
    setError(null);
    setEditing(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetValue = Number(inputValue);
    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      setError("올바른 목표값을 입력하세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = goal
        ? await fetch(`/api/goals/${goal.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetValue }),
          })
        : await fetch("/api/goals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ metricKey: metric.key, periodType, targetValue }),
          });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      setEditing(false);
      setStampKey((k) => k + 1);
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  if (!goal && !editing) {
    return (
      <button type="button" className={styles.goalSetButton} onClick={openForm}>
        목표 설정하기
      </button>
    );
  }

  if (editing) {
    return (
      <form className={styles.goalForm} onSubmit={handleSubmit}>
        {goal ? (
          <span className={styles.goalPeriodLabel}>
            {PERIOD_LABEL[goal.periodType as PeriodType]} 목표
          </span>
        ) : (
          <select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as PeriodType)}
          >
            <option value="weekly">주간</option>
            <option value="monthly">월간</option>
          </select>
        )}
        <input
          type="number"
          step="0.1"
          min="0"
          placeholder={`목표값 (${metric.unit})`}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <span className={styles.goalSaveWrap}>
          <button type="submit" disabled={submitting}>
            저장
          </button>
          {stampKey > 0 && <SealStamp key={stampKey} />}
        </span>
        <button type="button" onClick={() => setEditing(false)}>
          취소
        </button>
        {error && <p className={styles.errorText}>{error}</p>}
      </form>
    );
  }

  const target = goal!.targetValue;
  const percent = target > 0 ? Math.min(100, (currentDisplayValue / target) * 100) : 0;
  const achieved = currentDisplayValue >= target;

  return (
    <div className={styles.goalBlock}>
      <div className={styles.goalMeta}>
        <span>
          {PERIOD_LABEL[goal!.periodType as PeriodType]} 목표: {formatValue(metric, target)}
          {metric.unit} / 현재: {formatValue(metric, currentDisplayValue)}
          {metric.unit} (달성률 {percent.toFixed(0)}%)
        </span>
        <button type="button" className={styles.goalEditButton} onClick={openForm}>
          수정
        </button>
      </div>
      <div className={styles.progressTrack}>
        <div
          className={achieved ? styles.progressFillDone : styles.progressFillPending}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
