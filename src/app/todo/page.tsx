"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import PatientHistoryModal from "@/components/PatientHistoryModal";
import TodoTaskTable, {
  buildTaskRows,
  isRowResolved,
  splitByDateScope,
  SHARED_TASK_VALUE,
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
  const [showResolved, setShowResolved] = useState(false);
  const router = useRouter();

  const [showWorkForm, setShowWorkForm] = useState(false);
  const [workTitle, setWorkTitle] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [workAssigneeId, setWorkAssigneeId] = useState("");
  const [workDueDate, setWorkDueDate] = useState("");
  const [workSubmitting, setWorkSubmitting] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);

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

  // 날짜를 옮기면 "완료된 항목 보기" 펼침 상태를 초기화한다(홈 화면과 동일 원칙) — 체크
  // 후 재조회 때는 유지되어야 하므로 refreshKey는 의존성에서 뺀다.
  useEffect(() => {
    setShowResolved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

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
      tab: "talk",
      talkGroup: "1",
      patientId: String(patientId),
      date: toDateParam(selectedDate),
    });
    router.push(`/ai-studio?${params.toString()}`);
  }

  function resetWorkForm() {
    setShowWorkForm(false);
    setWorkTitle("");
    setWorkDescription("");
    setWorkAssigneeId("");
    setWorkDueDate("");
    setWorkError(null);
  }

  async function handleWorkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWorkError(null);

    const creatorId = getCurrentUserId();
    if (!creatorId) {
      setWorkError("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }
    if (!workTitle.trim()) {
      setWorkError("제목을 입력하세요.");
      return;
    }

    const isSharedTask = workAssigneeId === SHARED_TASK_VALUE;

    setWorkSubmitting(true);
    try {
      const res = await fetch("/api/work-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: workTitle,
          description: workDescription.trim() || undefined,
          creatorId,
          assigneeId: !isSharedTask && workAssigneeId ? Number(workAssigneeId) : undefined,
          isSharedTask,
          dueDate: workDueDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWorkError(data.error ?? "업무 등록에 실패했습니다.");
        return;
      }
      resetWorkForm();
      setRefreshKey((k) => k + 1);
    } finally {
      setWorkSubmitting(false);
    }
  }

  const { overdueUnresolved: overdueTasks, dueOnDate: todayTasks } = splitByDateScope(
    tasks ?? [],
    selectedDate,
  );
  const isToday = isSameDate(selectedDate, startOfDay(new Date()));
  const todaySectionLabel = isToday
    ? "오늘 할 일"
    : `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 할 일`;

  // 완료된 항목은 기본적으로 접어두고 "완료된 항목 보기" 토글로만 펼친다(홈 화면과 동일
  // 패턴, 톡/처방/업무 전체 타입 공통 적용) — 미완료 항목은 항상 노출한다.
  const todayRows = buildTaskRows(todayTasks);
  const todayUnresolvedRows = todayRows.filter((row) => !isRowResolved(row));
  const todayResolvedRows = todayRows.filter((row) => isRowResolved(row));
  const rowTasks = (row: (typeof todayRows)[number]) =>
    row.kind === "single" ? [row.task] : row.group.tasks;
  const todayUnresolvedTasks = todayUnresolvedRows.flatMap(rowTasks);
  const todayResolvedTasks = todayResolvedRows.flatMap(rowTasks);

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
        {!showWorkForm ? (
          <button
            type="button"
            className={styles.newWorkButton}
            onClick={() => setShowWorkForm(true)}
          >
            + 업무 등록
          </button>
        ) : (
          <form onSubmit={handleWorkSubmit}>
            <div className={styles.sectionTitle}>업무 등록</div>
            <div className={styles.workFormGrid}>
              <label className={styles.workFormFieldWide}>
                제목
                <input
                  type="text"
                  value={workTitle}
                  onChange={(e) => setWorkTitle(e.target.value)}
                />
              </label>
              <label className={styles.workFormFieldWide}>
                내용(선택)
                <textarea
                  className={styles.workFormTextarea}
                  rows={3}
                  value={workDescription}
                  onChange={(e) => setWorkDescription(e.target.value)}
                />
              </label>
              <label>
                요청대상
                <select
                  className={styles.select}
                  value={workAssigneeId}
                  onChange={(e) => setWorkAssigneeId(e.target.value)}
                >
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                  <option value={SHARED_TASK_VALUE}>전체 공통</option>
                  <option value="">지정 안 함 (나만 보기)</option>
                </select>
              </label>
              <label>
                마감일(선택)
                <input
                  type="date"
                  value={workDueDate}
                  onChange={(e) => setWorkDueDate(e.target.value)}
                />
              </label>
            </div>

            {workError && <p className={styles.errorText}>{workError}</p>}

            <div className={styles.workFormActions}>
              <button className={styles.submitButton} type="submit" disabled={workSubmitting}>
                등록
              </button>
              <button type="button" onClick={resetWorkForm}>
                취소
              </button>
            </div>
          </form>
        )}
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
            staffUsers={staffUsers}
            onCheck={handleCheck}
            onManageTalk={handleManageTalk}
            onPatientClick={setHistoryPatient}
            onWorkTaskChanged={() => setRefreshKey((k) => k + 1)}
          />
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          📅 {todaySectionLabel} ({todayTasks.length}건)
        </div>
        {tasks !== null && todayRows.length === 0 && (
          <p className={styles.muted}>처리할 항목이 없습니다.</p>
        )}
        {todayUnresolvedRows.length === 0 && todayRows.length > 0 && (
          <p className={styles.muted}>오늘 할 일을 모두 처리했습니다 🎉</p>
        )}
        {todayUnresolvedRows.length > 0 && (
          <TodoTaskTable
            tasks={todayUnresolvedTasks}
            referenceDate={selectedDate}
            // 업무(WORK)는 마감일이 있으면 이 구간에서도 D-day를 보여줘야 해서 마감 컬럼을 켠다 —
            // 톡/처방류는 이 구간(밀린 게 아닌 당일 할 일)에서 어차피 밀린 게 아니므로
            // 배지가 뜨지 않아 기존 화면과 체감상 차이가 없다.
            showDueBadge
            stampTaskId={stampTaskId}
            staffUsers={staffUsers}
            onCheck={handleCheck}
            onManageTalk={handleManageTalk}
            onPatientClick={setHistoryPatient}
            onWorkTaskChanged={() => setRefreshKey((k) => k + 1)}
          />
        )}

        {todayResolvedRows.length > 0 && (
          <>
            <button
              type="button"
              className={styles.resolvedToggleButton}
              onClick={() => setShowResolved((v) => !v)}
            >
              {showResolved ? "완료된 항목 접기" : `완료된 항목 보기 (${todayResolvedRows.length}건)`}
            </button>
            {showResolved && (
              <TodoTaskTable
                tasks={todayResolvedTasks}
                referenceDate={selectedDate}
                showDueBadge
                stampTaskId={stampTaskId}
                staffUsers={staffUsers}
                onCheck={handleCheck}
                onManageTalk={handleManageTalk}
                onPatientClick={setHistoryPatient}
                onWorkTaskChanged={() => setRefreshKey((k) => k + 1)}
              />
            )}
          </>
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
