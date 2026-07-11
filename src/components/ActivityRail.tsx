"use client";

import { useEffect, useState } from "react";
import styles from "./ActivityRail.module.css";

type ActivityLogRow = {
  id: number;
  actorType: "STAFF" | "PATIENT" | "SYSTEM";
  actorId: number | null;
  actionType: string;
  label: string;
  createdAt: string;
};

const POLL_INTERVAL_MS = 7000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 사이드바가 있는 일반 화면 전용 우측 고정 레일 — 순위/집계가 아니라 담담한 사실 나열
 * 로그 노출이 목적(경쟁/눈치 유발 방지, task.md 배경 참고). 토스트/알림음 없이 폴링으로만
 * 갱신한다. AppShell이 사이드바 없는 독립 화면(환자와함께보기/상담모드/공개티칭지)에서는
 * 아예 렌더링하지 않는다.
 */
export default function ActivityRail() {
  const [rows, setRows] = useState<ActivityLogRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/activity-log");
        if (!res.ok) return;
        const data: ActivityLogRow[] = await res.json();
        if (!cancelled) setRows(data);
      } catch {
        // 폴링 1회 실패는 조용히 무시하고 다음 주기에 재시도 — 부가 기능이라 화면 전체를
        // 에러 상태로 빠뜨릴 필요가 없다.
      }
    }

    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <aside className={styles.rail}>
      <div className={styles.title}>실시간 활동</div>
      <div className={styles.list}>
        {rows === null && <p className={styles.empty}>불러오는 중...</p>}
        {rows !== null && rows.length === 0 && <p className={styles.empty}>최근 활동이 없습니다.</p>}
        {rows?.map((row) => (
          <div
            key={row.id}
            className={row.actorType === "PATIENT" ? styles.itemPatient : styles.itemStaff}
          >
            <span className={styles.time}>{formatTime(row.createdAt)}</span>
            <span className={styles.label}>{row.label}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
