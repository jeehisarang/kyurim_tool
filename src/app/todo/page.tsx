"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import SealStamp from "@/components/SealStamp";
import { getCurrentUserId } from "@/lib/currentUser";

type StaffUser = { id: number; name: string; role: string };
type Patient = { id: number; name: string; chartNumber: string };
type Program = { id: number; name: string };
type Prescription = { id: number; patient: Patient; program: Program };
type TodoTask = {
  id: number;
  taskType: string;
  dueDate: string;
  isDone: boolean;
  prescription: Prescription;
  staffUser: StaffUser;
  doneByUser: StaffUser | null;
};

const TASK_TYPE_LABEL: Record<string, string> = {
  NEXT_DOSE: "다음 처방일",
  FOLLOW_UP: "후속조치",
};

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

  async function handleCheck(task: TodoTask) {
    const doneByUserId = getCurrentUserId();
    if (!doneByUserId) {
      alert("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }

    await fetch(`/api/todo-tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doneByUserId }),
    });

    setStampTaskId(task.id);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>오늘 할 일</h1>
      <div className={styles.dateLabel}>{todayLabel || "오늘"}</div>

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
        <div className={styles.sectionTitle}>할 일 목록 ({tasks?.length ?? 0}건)</div>
        {tasks !== null && tasks.length === 0 && (
          <p className={styles.muted}>오늘 처리할 항목이 없습니다.</p>
        )}
        {tasks && tasks.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>환자명</th>
                <th>프로그램명</th>
                <th>할일종류</th>
                <th>담당자</th>
                <th>완료여부</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.prescription.patient.name}</td>
                  <td>{task.prescription.program.name}</td>
                  <td>{TASK_TYPE_LABEL[task.taskType] ?? task.taskType}</td>
                  <td>{task.staffUser.name}</td>
                  <td>
                    {task.isDone ? (
                      <span className={styles.doneLabel}>
                        완료 ({task.doneByUser?.name ?? "-"})
                      </span>
                    ) : (
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
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
