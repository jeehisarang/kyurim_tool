"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import SealStamp from "@/components/SealStamp";
import { getCurrentUserId } from "@/lib/currentUser";
import { TALK_MESSAGE_TYPE_LABEL } from "@/lib/message-templates";

type StaffUser = { id: number; name: string; role: string };
type Patient = { id: number; name: string; chartNumber: string };
type Program = { id: number; name: string };
type TodoCategory = "PRESCRIPTION" | "TALK";
type TodoTask = {
  id: number;
  category: TodoCategory;
  taskType: string;
  dueDate: string;
  patient: Patient;
  program: Program | null;
  staffUser: StaffUser | null;
  isDone: boolean;
  doneByUser: StaffUser | null;
  skippedAt: string | null;
  skippedByUser: StaffUser | null;
};
type WeeklySummary = { weekDone: number; weekTotal: number };

const SKIPPABLE_TASK_TYPES = ["DAY7"];

const TASK_TYPE_LABEL: Record<string, string> = {
  NEXT_DOSE: "다음 처방일",
  FOLLOW_UP: "후속조치",
  ...TALK_MESSAGE_TYPE_LABEL,
};

const CATEGORY_LABEL: Record<TodoCategory, string> = {
  PRESCRIPTION: "처방",
  TALK: "톡",
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffDays(a: Date, b: Date): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
}

function isOverdue(task: TodoTask): boolean {
  return startOfDay(new Date(task.dueDate)) < startOfDay(new Date());
}

function overdueLabel(task: TodoTask): string {
  const due = startOfDay(new Date(task.dueDate));
  const days = diffDays(new Date(), due);
  return `${due.getMonth() + 1}/${due.getDate()} 마감, ${days}일 지남`;
}

export default function TodoPage() {
  const [todayLabel] = useState(() =>
    new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(new Date()),
  );
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [filterStaffId, setFilterStaffId] = useState<string>("");
  const [tasks, setTasks] = useState<TodoTask[] | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [stampTaskId, setStampTaskId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch("/api/staff-users")
      .then((res) => res.json())
      .then(setStaffUsers);
  }, []);

  useEffect(() => {
    const query = filterStaffId ? `?staffUserId=${filterStaffId}` : "";
    fetch(`/api/todo-tasks${query}`)
      .then((res) => res.json())
      .then(setTasks);
  }, [filterStaffId, refreshKey]);

  useEffect(() => {
    fetch("/api/todo-tasks/summary")
      .then((res) => res.json())
      .then(setWeeklySummary);
  }, [refreshKey]);

  async function handleCheck(task: TodoTask, action: "DONE" | "SKIPPED" = "DONE") {
    const doneByUserId = getCurrentUserId();
    if (!doneByUserId) {
      alert("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }

    await fetch(`/api/todo-tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doneByUserId, action }),
    });

    if (action === "DONE") setStampTaskId(task.id);
    setRefreshKey((k) => k + 1);
  }

  function renderTaskTable(list: TodoTask[], { showDueBadge }: { showDueBadge: boolean }) {
    return (
      <table className={styles.table}>
        <thead>
          <tr>
            <th>구분</th>
            <th>환자명</th>
            <th>프로그램명</th>
            <th>할일종류</th>
            {showDueBadge && <th>마감</th>}
            <th>담당자</th>
            <th>완료여부</th>
          </tr>
        </thead>
        <tbody>
          {list.map((task) => (
            <tr key={task.id}>
              <td>
                <span
                  className={
                    task.category === "PRESCRIPTION"
                      ? styles.categoryBadgePrescription
                      : styles.categoryBadgeTalk
                  }
                >
                  {CATEGORY_LABEL[task.category]}
                </span>
              </td>
              <td>{task.patient.name}</td>
              <td>{task.program?.name ?? "-"}</td>
              <td>{TASK_TYPE_LABEL[task.taskType] ?? task.taskType}</td>
              {showDueBadge && (
                <td>
                  <span className={styles.overdueBadge}>{overdueLabel(task)}</span>
                </td>
              )}
              <td>{task.staffUser?.name ?? "미배정"}</td>
              <td>
                {task.isDone ? (
                  <span className={styles.doneLabel}>완료 ({task.doneByUser?.name ?? "-"})</span>
                ) : task.skippedAt ? (
                  <span className={styles.skippedLabel}>
                    보류됨 ({task.skippedByUser?.name ?? "-"})
                  </span>
                ) : (
                  <span className={styles.actionsCell}>
                    <span className={styles.submitWrap}>
                      <button
                        className={styles.checkButton}
                        type="button"
                        onClick={() => handleCheck(task)}
                      >
                        체크
                      </button>
                      {stampTaskId === task.id && <SealStamp key={task.id} />}
                    </span>
                    {task.category === "TALK" && SKIPPABLE_TASK_TYPES.includes(task.taskType) && (
                      <button
                        className={styles.skipButton}
                        type="button"
                        onClick={() => handleCheck(task, "SKIPPED")}
                      >
                        보류
                      </button>
                    )}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const overdueTasks = tasks?.filter(isOverdue) ?? [];
  const todayTasks = tasks?.filter((t) => !isOverdue(t)) ?? [];

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>오늘 할 일</h1>
      <div className={styles.dateLabel}>{todayLabel || "오늘"}</div>

      {weeklySummary && (
        <div className={styles.section}>
          {weeklySummary.weekTotal === 0 ? (
            <p className={styles.muted}>이번주 예정된 작업이 없습니다.</p>
          ) : (
            <>
              <div className={styles.weeklyHeader}>
                <span>
                  이번주 처리 현황 <span className={styles.weeklySubLabel}>(밀린 일 포함)</span>
                </span>
                <span className={styles.weeklyValue}>
                  {weeklySummary.weekDone}/{weeklySummary.weekTotal}건
                </span>
              </div>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${Math.min(
                      100,
                      (weeklySummary.weekDone / weeklySummary.weekTotal) * 100,
                    )}%`,
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>담당자 필터</div>
        <select
          className={styles.select}
          value={filterStaffId}
          onChange={(e) => setFilterStaffId(e.target.value)}
        >
          <option value="">전체</option>
          {staffUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.role})
            </option>
          ))}
        </select>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>📌 밀린 할 일 ({overdueTasks.length}건)</div>
        {tasks !== null && overdueTasks.length === 0 && (
          <p className={styles.muted}>밀린 할 일이 없습니다.</p>
        )}
        {overdueTasks.length > 0 && renderTaskTable(overdueTasks, { showDueBadge: true })}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>📅 오늘 할 일 ({todayTasks.length}건)</div>
        {tasks !== null && todayTasks.length === 0 && (
          <p className={styles.muted}>오늘 처리할 항목이 없습니다.</p>
        )}
        {todayTasks.length > 0 && renderTaskTable(todayTasks, { showDueBadge: false })}
      </div>
    </div>
  );
}
