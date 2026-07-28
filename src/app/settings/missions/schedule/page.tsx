"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";

type ScheduleDay = { weekday: number; isActive: boolean };

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 발송요일(/settings/missions/schedule, task.md 3-2) — 요일 체크박스 7개.
 */
export default function MissionScheduleSettingsPage() {
  const { currentUser } = useCurrentUserContext();
  const isDirector = currentUser?.role === "원장";

  const [schedule, setSchedule] = useState<ScheduleDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/missions/schedule")
      .then((res) => res.json())
      .then(setSchedule);
  }, []);

  async function handleToggle(weekday: number, current: boolean) {
    if (!currentUser) return;
    setError(null);
    const res = await fetch("/api/missions/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffUserId: currentUser.id, weekday, isActive: !current }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "저장에 실패했습니다.");
      return;
    }
    setSchedule((prev) =>
      prev ? prev.map((d) => (d.weekday === weekday ? { ...d, isActive: !current } : d)) : prev,
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>미션 발송요일</h1>
      </div>
      <p className={styles.muted}>미션을 발송할 요일을 선택하세요.</p>

      <div className={styles.section}>
        {!isDirector && <p className={styles.errorText}>원장만 발송요일을 변경할 수 있습니다.</p>}
        {schedule === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : (
          <div className={styles.weekdayGrid}>
            {schedule.map((day) => (
              <label
                key={day.weekday}
                className={`${styles.weekdayItem} ${day.isActive ? styles.weekdayItemActive : ""}`}
              >
                <span>{WEEKDAY_LABELS[day.weekday]}요일</span>
                <input
                  type="checkbox"
                  checked={day.isActive}
                  disabled={!isDirector}
                  onChange={() => handleToggle(day.weekday, day.isActive)}
                />
              </label>
            ))}
          </div>
        )}
        {error && <p className={styles.errorText}>{error}</p>}
      </div>
    </div>
  );
}
