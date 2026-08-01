"use client";

import styles from "./PeriodSelect.module.css";
import { STATS_PERIOD_OPTIONS, type StatsPeriod } from "@/lib/stats-period";

// 예약율/인당내원수/링크클릭률 카드가 각각 독립적으로 하나씩 인스턴스를 들고 쓴다
// (task2.md — "드롭다운 각각 독립적으로 선택 가능하게").
export default function PeriodSelect({
  value,
  onChange,
}: {
  value: StatsPeriod;
  onChange: (value: StatsPeriod) => void;
}) {
  return (
    <select
      className={styles.select}
      value={value}
      onChange={(e) => onChange(e.target.value as StatsPeriod)}
    >
      {STATS_PERIOD_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
