"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import SealStamp from "@/components/SealStamp";
import PatientHistoryModal from "@/components/PatientHistoryModal";
import CategoryBadge from "@/components/CategoryBadge";
import { getCurrentUserId } from "@/lib/currentUser";
import { TALK_MESSAGE_TYPE_LABEL, TRIAL_TASK_TYPE_LABEL } from "@/lib/message-templates";

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
  ...TRIAL_TASK_TYPE_LABEL,
};

const TASK_TYPE_ICON: Record<string, string> = {
  NEXT_DOSE: "💊",
  FOLLOW_UP: "📋",
  DAY2: "💬",
  DAY7: "💬",
  THIRD_VISIT: "💬",
  TRIAL_WELCOME: "🧪",
  TRIAL_DAY2: "🧪",
  TRIAL_DEADLINE: "🧪",
};

const TALK_TASK_TYPES = ["DAY2", "DAY7", "THIRD_VISIT", "TRIAL_WELCOME", "TRIAL_DAY2", "TRIAL_DEADLINE"];

function taskTypeBadgeClass(taskType: string): string {
  if (taskType === "NEXT_DOSE") return styles.taskTypeBadgeDose;
  if (taskType === "FOLLOW_UP") return styles.taskTypeBadgeFollowUp;
  if (TALK_TASK_TYPES.includes(taskType)) return styles.taskTypeBadgeTalk;
  return styles.taskTypeBadgeDose;
}

const CATEGORY_LABEL: Record<TodoCategory, string> = {
  PRESCRIPTION: "처방",
  TALK: "톡",
};

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

function diffDays(a: Date, b: Date): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
}

/** 밀린 일 = dueDate가 기준 날짜보다 이전. 기준은 항상 "지금 보고 있는 날짜"(selectedDate). */
function isOverdue(task: TodoTask, referenceDate: Date): boolean {
  return startOfDay(new Date(task.dueDate)) < startOfDay(referenceDate);
}

function overdueLabel(task: TodoTask, referenceDate: Date): string {
  const due = startOfDay(new Date(task.dueDate));
  const days = diffDays(referenceDate, due);
  return `${due.getMonth() + 1}/${due.getDate()} 마감, ${days}일 지남`;
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
  const [skippingTaskId, setSkippingTaskId] = useState<number | null>(null);
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

  async function handleCheck(task: TodoTask, action: "DONE" | "SKIPPED" = "DONE") {
    const doneByUserId = getCurrentUserId();
    if (!doneByUserId) {
      alert("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }

    if (action === "SKIPPED") setSkippingTaskId(task.id);

    await fetch(`/api/todo-tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doneByUserId, action }),
    });

    if (action === "DONE") setStampTaskId(task.id);
    setRefreshKey((k) => k + 1);
  }

  function handleGenerateTalk(task: TodoTask) {
    // program이 있으면 프로그램 이벤트(예: 킬팻캡슐 3일체험 TRIAL_*) — todoTaskId로 단일 카드 라우팅.
    if (task.program) {
      router.push(`/messages?todoTaskId=${task.id}`);
      return;
    }
    const params = new URLSearchParams({
      patientId: String(task.patient.id),
      chartNumber: task.patient.chartNumber,
      name: task.patient.name,
      messageType: task.taskType,
    });
    router.push(`/messages?${params.toString()}`);
  }

  function renderTaskTable(
    list: TodoTask[],
    { showDueBadge, referenceDate }: { showDueBadge: boolean; referenceDate: Date },
  ) {
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
              <td>
                <button
                  type="button"
                  className={styles.patientNameButton}
                  onClick={() => setHistoryPatient(task.patient)}
                >
                  {task.patient.name}
                </button>
              </td>
              <td>
                {task.program ? <CategoryBadge id={task.program.id} name={task.program.name} /> : "-"}
              </td>
              <td>
                <span className={taskTypeBadgeClass(task.taskType)}>
                  {TASK_TYPE_ICON[task.taskType] ?? ""} {TASK_TYPE_LABEL[task.taskType] ?? task.taskType}
                </span>
              </td>
              {showDueBadge && (
                <td>
                  <span className={styles.overdueBadge}>{overdueLabel(task, referenceDate)}</span>
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
                        {skippingTaskId === task.id ? "보류함" : "보류"}
                      </button>
                    )}
                    {task.category === "TALK" && (
                      <button
                        className={styles.talkGenerateButton}
                        type="button"
                        onClick={() => handleGenerateTalk(task)}
                      >
                        톡생성 하기
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

  const overdueTasks =
    tasks?.filter((t) => isOverdue(t, selectedDate) && !t.isDone && !t.skippedAt) ?? [];
  const todayTasks = tasks?.filter((t) => !isOverdue(t, selectedDate)) ?? [];
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
        {overdueTasks.length > 0 &&
          renderTaskTable(overdueTasks, { showDueBadge: true, referenceDate: selectedDate })}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          📅 {todaySectionLabel} ({todayTasks.length}건)
        </div>
        {tasks !== null && todayTasks.length === 0 && (
          <p className={styles.muted}>처리할 항목이 없습니다.</p>
        )}
        {todayTasks.length > 0 &&
          renderTaskTable(todayTasks, { showDueBadge: false, referenceDate: selectedDate })}
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
