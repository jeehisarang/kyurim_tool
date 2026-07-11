"use client";

import styles from "./TodoSplitView.module.css";
import TodoTaskTable, { type TodoTaskTableProps } from "./TodoTaskTable";

// /todo 페이지 전용 좌우 분리 래퍼 — 좌측 "톡/처방"은 기존 전체 컬럼, 우측 "업무"는
// 환자명/프로그램명이 없는 반쪽 표(TodoTaskTable mode="work")로 나눠 보여준다.
// 홈 화면 미리보기 위젯은 이 분리가 필요 없어 TodoTaskTable을 그대로 계속 사용한다.
type TodoSplitViewProps = Omit<TodoTaskTableProps, "mode">;

export default function TodoSplitView(props: TodoSplitViewProps) {
  const talkPrescriptionTasks = props.tasks.filter((t) => t.category !== "WORK");
  const workTasks = props.tasks.filter((t) => t.category === "WORK");

  return (
    <div className={styles.splitGrid}>
      <div className={styles.column}>
        <div className={styles.columnTitle}>톡/처방</div>
        {talkPrescriptionTasks.length === 0 ? (
          <p className={styles.empty}>표시할 톡/처방 항목이 없습니다.</p>
        ) : (
          <TodoTaskTable {...props} tasks={talkPrescriptionTasks} />
        )}
      </div>
      <div className={styles.columnNarrow}>
        <div className={styles.columnTitle}>업무</div>
        {workTasks.length === 0 ? (
          <p className={styles.empty}>표시할 업무 항목이 없습니다.</p>
        ) : (
          <TodoTaskTable {...props} tasks={workTasks} mode="work" />
        )}
      </div>
    </div>
  );
}
