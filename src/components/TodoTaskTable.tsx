"use client";

import styles from "./TodoTaskTable.module.css";
import SealStamp from "@/components/SealStamp";
import CategoryBadge from "@/components/CategoryBadge";
import { getProgramCategory, PROGRAM_CATEGORY_ICON } from "@/lib/program-categories";

export type StaffUser = { id: number; name: string; role: string };
export type Patient = { id: number; name: string; chartNumber: string };
export type Program = { id: number; name: string };
export type TodoCategory = "PRESCRIPTION" | "TALK";
export type TodoTask = {
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
};

function taskTypeBadgeClass(taskType: string): string {
  if (taskType === "FOLLOW_UP") return styles.taskTypeBadgeFollowUp;
  return styles.taskTypeBadgeDose;
}

function ProgramBadge({ id, name }: { id: number; name: string }) {
  const category = getProgramCategory(name);
  return (
    <CategoryBadge
      id={id}
      name={name}
      categoryKey={category ?? undefined}
      icon={category ? PROGRAM_CATEGORY_ICON[category] : undefined}
    />
  );
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffDays(a: Date, b: Date): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
}

function overdueLabel(task: TodoTask, referenceDate: Date): string {
  const due = startOfDay(new Date(task.dueDate));
  const days = diffDays(referenceDate, due);
  return `${due.getMonth() + 1}/${due.getDate()} 마감, ${days}일 지남`;
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

function earliestTask(tasks: TodoTask[]): TodoTask {
  return tasks.reduce((a, b) => (new Date(a.dueDate) < new Date(b.dueDate) ? a : b));
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
  onCheck: (task: TodoTask) => void;
  onManageTalk: (patientId: number) => void;
  onPatientClick: (patient: Patient) => void;
};

export default function TodoTaskTable({
  tasks,
  referenceDate,
  showDueBadge,
  stampTaskId,
  onCheck,
  onManageTalk,
  onPatientClick,
}: TodoTaskTableProps) {
  const rows = buildTaskRows(tasks);

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
                        {overdueLabel(earliestTask(group.tasks), referenceDate)}
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
          return (
            <tr key={task.id}>
              <td>
                <span className={styles.categoryBadgePrescription}>{CATEGORY_LABEL.PRESCRIPTION}</span>
              </td>
              <td>
                <button
                  type="button"
                  className={styles.patientNameButton}
                  onClick={() => onPatientClick(task.patient)}
                >
                  {task.patient.name}
                </button>
              </td>
              <td>
                {task.program ? <ProgramBadge id={task.program.id} name={task.program.name} /> : "-"}
              </td>
              <td>
                <span className={taskTypeBadgeClass(task.taskType)}>
                  {TASK_TYPE_ICON[task.taskType] ?? ""} {TASK_TYPE_LABEL[task.taskType] ?? task.taskType}
                </span>
              </td>
              {showDueBadge && (
                <td>
                  {isOverdueTask(task, referenceDate) && (
                    <span className={styles.overdueBadge}>{overdueLabel(task, referenceDate)}</span>
                  )}
                </td>
              )}
              <td>{task.staffUser?.name ?? "미배정"}</td>
              <td>
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
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function isOverdueTask(task: TodoTask, referenceDate: Date): boolean {
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
  return {
    overdueUnresolved: tasks.filter(
      (t) => isOverdueTask(t, referenceDate) && !t.isDone && !t.skippedAt,
    ),
    dueOnDate: tasks.filter((t) => !isOverdueTask(t, referenceDate)),
  };
}
