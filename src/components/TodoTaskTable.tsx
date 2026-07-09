"use client";

import { Fragment, useState } from "react";
import styles from "./TodoTaskTable.module.css";
import SealStamp from "@/components/SealStamp";
import ProgramBadge from "@/components/ProgramBadge";

// 요청대상 드롭다운(등록/수정 공통)에서 "전체 공통"을 나타내는 구분값 — 실제 staffUser id와
// 겹치지 않게 문자열로 고정한다(빈 문자열은 "지정 안 함"에 쓰이고 있음).
export const SHARED_TASK_VALUE = "SHARED";

export type StaffUser = { id: number; name: string; role: string };
export type Patient = { id: number; name: string; chartNumber: string };
export type Program = { id: number; name: string };
export type TodoCategory = "PRESCRIPTION" | "TALK" | "WORK";
export type TodoTask = {
  id: number;
  category: TodoCategory;
  taskType: string;
  // WORK는 마감일이 선택사항이라 null일 수 있다 — 그 외 타입은 항상 값이 있다.
  dueDate: string | null;
  patient: Patient | null;
  program: Program | null;
  staffUser: StaffUser | null;
  isDone: boolean;
  doneByUser: StaffUser | null;
  skippedAt: string | null;
  skippedByUser: StaffUser | null;
  // WORK 전용 필드 — 그 외 카테고리에서는 항상 undefined/null.
  title?: string;
  description?: string | null;
  creator?: StaffUser | null;
  assignee?: StaffUser | null;
  // true면 특정 1인이 아니라 모든 직원 화면에 노출되는 "전체 공통" 업무(staffUser는 null).
  isSharedTask?: boolean;
};

// 톡 성격 TodoTask는 항상 그룹행("톡 후보 N건")으로만 표시되므로, 여기서는
// 개별 줄로 남는 처방류(NEXT_DOSE/FOLLOW_UP) 라벨만 필요하다.
const TASK_TYPE_LABEL: Record<string, string> = {
  NEXT_DOSE: "다음 처방일",
  FOLLOW_UP: "후속조치",
};

const TASK_TYPE_ICON: Record<string, string> = {
  NEXT_DOSE: "💊",
  FOLLOW_UP: "📋",
};

const CATEGORY_LABEL: Record<TodoCategory, string> = {
  PRESCRIPTION: "처방",
  TALK: "톡",
  WORK: "업무",
};

function taskTypeBadgeClass(taskType: string): string {
  if (taskType === "FOLLOW_UP") return styles.taskTypeBadgeFollowUp;
  return styles.taskTypeBadgeDose;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffDays(a: Date, b: Date): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
}

function overdueLabel(dueDateIso: string, referenceDate: Date): string {
  const due = startOfDay(new Date(dueDateIso));
  const days = diffDays(referenceDate, due);
  return `${due.getMonth() + 1}/${due.getDate()} 마감, ${days}일 지남`;
}

// WORK 전용 D-day 표시(마감 전엔 D-N, 마감 지나면 D+N, 당일엔 D-day).
function dDayLabel(dueDateIso: string, referenceDate: Date): string {
  const due = startOfDay(new Date(dueDateIso));
  const days = diffDays(due, referenceDate);
  if (days === 0) return "D-day";
  if (days > 0) return `D-${days}`;
  return `D+${-days}`;
}

// 마감 3일 이내(D-3~D-day, 아직 안 지남)는 임박 강조색, 지났으면 지남 배지, 그 외는 기본색.
function ddayBadgeClass(dueDateIso: string, referenceDate: Date): string {
  const due = startOfDay(new Date(dueDateIso));
  const days = diffDays(due, referenceDate);
  if (days < 0) return styles.overdueBadge;
  if (days <= 3) return styles.urgentBadge;
  return styles.ddayBadge;
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 업무 수정 폼의 요청대상 select 값(현재 상태 기준)을 만든다.
function workAssigneeSelectValue(task: TodoTask): string {
  if (task.isSharedTask) return SHARED_TASK_VALUE;
  if (task.assignee) return String(task.assignee.id);
  return "";
}

type TalkGroup = {
  key: string;
  patient: Patient;
  programLabels: string[];
  tasks: TodoTask[];
};

type TaskRow = { kind: "single"; task: TodoTask } | { kind: "group"; group: TalkGroup };

/**
 * 같은 환자 + 톡 성격(taskType이 톡 관련인 것 = category "TALK")의 TodoTask는 한 줄로 묶는다.
 * 톡이 아닌 항목(처방류)은 개별 줄 그대로 유지 — 그룹핑 대상이 아니다.
 * 우선순위 계산/억제는 하지 않고 있는 그대로 묶어서 보여주기만 한다.
 * /todo와 /home이 동일하게 사용하는 공유 로직 — 중복 구현 지양.
 */
export function buildTaskRows(list: TodoTask[]): TaskRow[] {
  const rows: TaskRow[] = [];
  const groups = new Map<string, TalkGroup>();

  for (const task of list) {
    if (task.category !== "TALK") {
      rows.push({ kind: "single", task });
      continue;
    }
    // API가 정상 필터링하면 나오지 않아야 하지만(고아 TodoTask 방어), patient 없이
    // 들어오면 그룹핑 키를 만들 수 없어 통째로 죽는 대신 그 항목만 건너뛴다.
    if (!task.patient) {
      console.warn(`TodoTask ${task.id}: patient 정보가 없어 화면에서 제외합니다.`);
      continue;
    }
    const key = String(task.patient.id);
    let group = groups.get(key);
    if (!group) {
      group = { key, patient: task.patient, programLabels: [], tasks: [] };
      groups.set(key, group);
      rows.push({ kind: "group", group });
    }
    group.tasks.push(task);
    if (task.program && !group.programLabels.includes(task.program.name)) {
      group.programLabels.push(task.program.name);
    }
  }

  return rows;
}

export function isRowResolved(row: TaskRow): boolean {
  if (row.kind === "single") return row.task.isDone;
  return row.group.tasks.every((t) => t.isDone || t.skippedAt);
}

// 톡 그룹(TalkGroup)은 항상 메시지형 타입만 모이고, 메시지형은 dueDate가 항상 채워져
// 있으므로(WORK만 null 가능하고 WORK는 그룹핑 대상이 아님) non-null 단언이 안전하다.
function earliestTask(tasks: TodoTask[]): TodoTask {
  return tasks.reduce((a, b) => (new Date(a.dueDate!) < new Date(b.dueDate!) ? a : b));
}

function staffLabel(tasks: TodoTask[]): string {
  const names = Array.from(
    new Set(tasks.map((t) => t.staffUser?.name).filter((n): n is string => Boolean(n))),
  );
  return names.length > 0 ? names.join(", ") : "미배정";
}

export type TodoTaskTableProps = {
  tasks: TodoTask[];
  referenceDate: Date;
  showDueBadge: boolean;
  stampTaskId: number | null;
  staffUsers: StaffUser[];
  onCheck: (task: TodoTask) => void;
  onManageTalk: (patientId: number) => void;
  onPatientClick: (patient: Patient) => void;
  // WORK 수정/삭제가 성공하면 호출 — 부모가 목록을 다시 불러오게 한다(체크 처리와 동일한 새로고침 패턴).
  onWorkTaskChanged: () => void;
};

export default function TodoTaskTable({
  tasks,
  referenceDate,
  showDueBadge,
  stampTaskId,
  staffUsers,
  onCheck,
  onManageTalk,
  onPatientClick,
  onWorkTaskChanged,
}: TodoTaskTableProps) {
  const rows = buildTaskRows(tasks);

  const [editingWorkId, setEditingWorkId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAssigneeSelection, setEditAssigneeSelection] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function startEditWork(task: TodoTask) {
    setEditingWorkId(task.id);
    setEditTitle(task.title ?? "");
    setEditDescription(task.description ?? "");
    setEditAssigneeSelection(workAssigneeSelectValue(task));
    setEditDueDate(task.dueDate ? toDateInputValue(task.dueDate) : "");
    setEditError(null);
  }

  function cancelEditWork() {
    setEditingWorkId(null);
    setEditError(null);
  }

  async function saveEditWork(taskId: number) {
    setEditSaving(true);
    setEditError(null);
    try {
      const isSharedTask = editAssigneeSelection === SHARED_TASK_VALUE;
      const res = await fetch(`/api/work-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription.trim() || undefined,
          assigneeId: !isSharedTask && editAssigneeSelection ? Number(editAssigneeSelection) : undefined,
          isSharedTask,
          dueDate: editDueDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "수정에 실패했습니다.");
        return;
      }
      setEditingWorkId(null);
      onWorkTaskChanged();
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteWork(taskId: number) {
    if (!window.confirm("이 업무를 삭제하시겠습니까?")) return;
    await fetch(`/api/work-tasks/${taskId}`, { method: "DELETE" });
    onWorkTaskChanged();
  }

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
        {rows.map((row) => {
          if (row.kind === "group") {
            const { group } = row;
            const unresolvedCount = group.tasks.filter((t) => !t.isDone && !t.skippedAt).length;
            return (
              <tr key={`group-${group.key}`}>
                <td>
                  <span className={styles.categoryBadgeTalk}>{CATEGORY_LABEL.TALK}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.patientNameButton}
                    onClick={() => onPatientClick(group.patient)}
                  >
                    {group.patient.name}
                  </button>
                </td>
                <td>{group.programLabels.length > 0 ? group.programLabels.join(", ") : "-"}</td>
                <td>
                  <span className={styles.taskTypeBadgeTalk}>💬 톡 후보 {group.tasks.length}건</span>
                </td>
                {showDueBadge && (
                  <td>
                    {isOverdueGroup(group, referenceDate) && (
                      <span className={styles.overdueBadge}>
                        {overdueLabel(earliestTask(group.tasks).dueDate!, referenceDate)}
                      </span>
                    )}
                  </td>
                )}
                <td>{staffLabel(group.tasks)}</td>
                <td>
                  <span className={styles.actionsCell}>
                    {unresolvedCount === 0 ? (
                      <span className={styles.doneLabel}>완료</span>
                    ) : (
                      <span className={styles.muted}>미완료 {unresolvedCount}건</span>
                    )}
                    <button
                      className={styles.talkGenerateButton}
                      type="button"
                      onClick={() => onManageTalk(group.patient.id)}
                    >
                      톡 관리
                    </button>
                  </span>
                </td>
              </tr>
            );
          }

          const task = row.task;
          const isWork = task.category === "WORK";
          const isEditingThis = editingWorkId === task.id;
          const colSpan = showDueBadge ? 7 : 6;
          return (
            <Fragment key={task.id}>
              <tr>
                <td>
                  {isWork ? (
                    <span className={styles.categoryBadgeWork}>{CATEGORY_LABEL.WORK}</span>
                  ) : (
                    <span className={styles.categoryBadgePrescription}>{CATEGORY_LABEL.PRESCRIPTION}</span>
                  )}
                </td>
                <td>
                  {task.patient ? (
                    <button
                      type="button"
                      className={styles.patientNameButton}
                      onClick={() => onPatientClick(task.patient!)}
                    >
                      {task.patient.name}
                    </button>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  {task.program ? <ProgramBadge id={task.program.id} name={task.program.name} /> : "-"}
                </td>
                <td>
                  {isWork ? (
                    <span className={styles.taskTypeBadgeWork}>
                      📌 {task.title}
                      {task.isSharedTask ? (
                        <span className={styles.selfAssignedTag}> (전체 공통)</span>
                      ) : (
                        !task.assignee && <span className={styles.selfAssignedTag}> (자율업무)</span>
                      )}
                    </span>
                  ) : (
                    <span className={taskTypeBadgeClass(task.taskType)}>
                      {TASK_TYPE_ICON[task.taskType] ?? ""} {TASK_TYPE_LABEL[task.taskType] ?? task.taskType}
                    </span>
                  )}
                </td>
                {showDueBadge && (
                  <td>
                    {isWork
                      ? task.dueDate && (
                          <span className={ddayBadgeClass(task.dueDate, referenceDate)}>
                            {dDayLabel(task.dueDate, referenceDate)}
                          </span>
                        )
                      : isOverdueTask(task, referenceDate) && (
                          <span className={styles.overdueBadge}>
                            {overdueLabel(task.dueDate!, referenceDate)}
                          </span>
                        )}
                  </td>
                )}
                <td>{isWork && task.isSharedTask ? "전체 공통" : (task.staffUser?.name ?? "미배정")}</td>
                <td>
                  <span className={styles.actionsCell}>
                    {task.isDone ? (
                      <span className={styles.doneLabel}>완료 ({task.doneByUser?.name ?? "-"})</span>
                    ) : (
                      <span className={styles.submitWrap}>
                        <button className={styles.checkButton} type="button" onClick={() => onCheck(task)}>
                          체크
                        </button>
                        {stampTaskId === task.id && <SealStamp key={task.id} />}
                      </span>
                    )}
                    {isWork && (
                      <>
                        <button
                          type="button"
                          className={styles.workEditButton}
                          onClick={() => (isEditingThis ? cancelEditWork() : startEditWork(task))}
                        >
                          {isEditingThis ? "취소" : "수정"}
                        </button>
                        <button
                          type="button"
                          className={styles.workDeleteButton}
                          onClick={() => handleDeleteWork(task.id)}
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </span>
                </td>
              </tr>
              {isEditingThis && (
                <tr>
                  <td colSpan={colSpan}>
                    <div className={styles.editWorkForm}>
                      <label>
                        제목
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                        />
                      </label>
                      <label>
                        내용(선택)
                        <input
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                        />
                      </label>
                      <label>
                        요청대상
                        <select
                          value={editAssigneeSelection}
                          onChange={(e) => setEditAssigneeSelection(e.target.value)}
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
                          value={editDueDate}
                          onChange={(e) => setEditDueDate(e.target.value)}
                        />
                      </label>
                      <div className={styles.editWorkActions}>
                        <button
                          type="button"
                          className={styles.checkButton}
                          onClick={() => saveEditWork(task.id)}
                          disabled={editSaving}
                        >
                          저장
                        </button>
                        <button type="button" onClick={cancelEditWork}>
                          취소
                        </button>
                      </div>
                      {editError && <p className={styles.editWorkError}>{editError}</p>}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export function isOverdueTask(task: TodoTask, referenceDate: Date): boolean {
  // 마감일이 없는 WORK는 밀림 분류 대상에서 제외 — 완료 전까지 계속 "오늘 할 일"에 남는다.
  if (task.dueDate === null) return false;
  return startOfDay(new Date(task.dueDate)) < startOfDay(referenceDate);
}

function isOverdueGroup(group: TalkGroup, referenceDate: Date): boolean {
  return isOverdueTask(earliestTask(group.tasks), referenceDate);
}

/**
 * /api/todo-tasks?date=X는 dueDate < X 자정인 것을 전부 반환한다(완료 여부 무관, 하한 없음) —
 * 화면에 그대로 뿌리면 과거에 완료된 건까지 전부 섞여 나온다(실사용 버그로 확인됨: 51건 vs 정상 8건).
 * "밀린 할 일(미완료 초과분만)" + "선택 날짜의 할 일(완료 포함)"로 좁히는 스코프 로직을
 * /todo와 /home이 공유한다 — 각자 다시 구현하지 말 것.
 */
export function splitByDateScope(
  tasks: TodoTask[],
  referenceDate: Date,
): { overdueUnresolved: TodoTask[]; dueOnDate: TodoTask[] } {
  const isResolved = (t: TodoTask) => t.isDone || Boolean(t.skippedAt);
  return {
    // "밀린 일"은 아직 처리 안 된 것만 — 완료/보류된 건 늦게 처리했더라도 더 이상 "밀려있는"
    // 게 아니므로 여기 남지 않는다(그렇다고 사라지면 안 되므로 dueOnDate로 옮겨서 보여준다).
    overdueUnresolved: tasks.filter((t) => isOverdueTask(t, referenceDate) && !isResolved(t)),
    // 마감이 지났어도 완료/보류된 건 "오늘 할 일" 쪽으로 옮겨 보여준다 — 그래야 완료
    // 처리한 즉시 그 자리에서 "완료"로 계속 보이고(완료된 항목 보기 토글로만 접힘),
    // 조회 시점에 화면에서 통째로 사라지는 일이 없다.
    dueOnDate: tasks.filter((t) => !isOverdueTask(t, referenceDate) || isResolved(t)),
  };
}
