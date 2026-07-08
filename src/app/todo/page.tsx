"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import PatientHistoryModal from "@/components/PatientHistoryModal";
import TodoTaskTable, {
  splitByDateScope,
  type Patient,
  type StaffUser,
  type TodoTask,
} from "@/components/TodoTaskTable";
import { getCurrentUserId } from "@/lib/currentUser";

type WeeklySummary = { weekDone: number; weekTotal: number };

const WEEKDAY_FULL_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateParam(value: string | null): Date {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return startOfDay(new Date());
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function formatFullLabel(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY_FULL_LABELS[date.getDay()]})`;
}

export default function TodoPage() {
  return (
    <Suspense fallback={null}>
      <TodoPageInner />
    </Suspense>
  );
}

function TodoPageInner() {
  const searchParams = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(() => parseDateParam(searchParams.get("date")));
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [filterStaffId, setFilterStaffId] = useState<string>("");
  const [tasks, setTasks] = useState<TodoTask[] | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [stampTaskId, setStampTaskId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/staff-users")
      .then((res) => res.json())
      .then(setStaffUsers);
  }, []);

  useEffect(() => {
    const query = new URLSearchParams({ date: toDateParam(selectedDate) });
    if (filterStaffId) query.set("staffUserId", filterStaffId);
    fetch(`/api/todo-tasks?${query.toString()}`)
      .then((res) => res.json())
      .then(setTasks);
  }, [filterStaffId, refreshKey, selectedDate]);

  useEffect(() => {
    fetch("/api/todo-tasks/summary")
      .then((res) => res.json())
      .then(setWeeklySummary);
  }, [refreshKey]);

  async function handleCheck(task: TodoTask) {
    const doneByUserId = getCurrentUserId();
    if (!doneByUserId) {
      alert("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }

    await fetch(`/api/todo-tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doneByUserId, action: "DONE" }),
    });

    setStampTaskId(task.id);
    setRefreshKey((k) => k + 1);
  }

  // 톡 후보가 1건이든 여러 건이든(내원기반+프로그램기반 섞여 있어도) 항상 "톡 관리"
  // 통합 체크리스트로 보낸다 — 우선순위 판단은 담당자가 그 화면에서 직접 한다.
  function handleManageTalk(patientId: number) {
    const params = new URLSearchParams({
      talkGroup: "1",
      patientId: String(patientId),
      date: toDateParam(selectedDate),
    });
    router.push(`/messages?${params.toString()}`);
  }

  const { overdueUnresolved: overdueTasks, dueOnDate: todayTasks } = splitByDateScope(
    tasks ?? [],
    selectedDate,
  );
  const isToday = isSameDate(selectedDate, startOfDay(new Date()));
  const todaySectionLabel = isToday
    ? "오늘 할 일"
    : `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 할 일`;

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>오늘 할 일</h1>

      <div className={styles.dateNav}>
        <button
          type="button"
          className={styles.dateNavArrow}
          onClick={() => setSelectedDate((d) => addDays(d, -1))}
          aria-label="하루 전"
        >
          ◀
        </button>
        <span className={styles.dateNavLabel}>{formatFullLabel(selectedDate)}</span>
        <button
          type="button"
          className={styles.dateNavArrow}
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
          aria-label="하루 후"
        >
          ▶
        </button>
        <button
          type="button"
          className={styles.dateNavTodayButton}
          onClick={() => setSelectedDate(startOfDay(new Date()))}
        >
          오늘
        </button>
      </div>

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
        {overdueTasks.length > 0 && (
          <TodoTaskTable
            tasks={overdueTasks}
            referenceDate={selectedDate}
            showDueBadge
            stampTaskId={stampTaskId}
            onCheck={handleCheck}
            onManageTalk={handleManageTalk}
            onPatientClick={setHistoryPatient}
          />
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          📅 {todaySectionLabel} ({todayTasks.length}건)
        </div>
        {tasks !== null && todayTasks.length === 0 && (
          <p className={styles.muted}>처리할 항목이 없습니다.</p>
        )}
        {todayTasks.length > 0 && (
          <TodoTaskTable
            tasks={todayTasks}
            referenceDate={selectedDate}
            showDueBadge={false}
            stampTaskId={stampTaskId}
            onCheck={handleCheck}
            onManageTalk={handleManageTalk}
            onPatientClick={setHistoryPatient}
          />
        )}
      </div>

      {historyPatient && (
        <PatientHistoryModal
          patientId={historyPatient.id}
          patientName={historyPatient.name}
          onClose={() => setHistoryPatient(null)}
        />
      )}
    </div>
  );
}
