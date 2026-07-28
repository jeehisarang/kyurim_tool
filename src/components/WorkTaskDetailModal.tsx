"use client";

import styles from "./WorkTaskDetailModal.module.css";

/**
 * 업무(WORK) 항목 읽기전용 미리보기 팝업(task2.md) — /home, /todo(TodoSplitView 경유) 둘 다
 * TodoTaskTable 하나를 공유하므로 이 모달도 TodoTaskTable 안에서 한 번만 붙이면 양쪽에
 * 자동 적용된다. 여기서는 어떤 값도 수정/저장하지 않는다 — "수정하기"는 기존 인라인
 * 수정 폼(TodoTaskTable의 startEditWork)을 여는 콜백만 호출한다.
 */
export default function WorkTaskDetailModal({
  title,
  description,
  assigneeLabel,
  dueDateLabel,
  onClose,
  onEdit,
}: {
  title: string;
  description: string | null;
  assigneeLabel: string;
  dueDateLabel: string | null;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>업무 내용</span>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            닫기
          </button>
        </div>

        <div className={styles.fieldList}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>제목</span>
            <span className={styles.fieldValue}>{title}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>내용</span>
            {description ? (
              <span className={styles.fieldValue}>{description}</span>
            ) : (
              <span className={styles.fieldValueMuted}>내용 없음</span>
            )}
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>담당자</span>
            <span className={styles.fieldValue}>{assigneeLabel}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>마감일</span>
            {dueDateLabel ? (
              <span className={styles.fieldValue}>{dueDateLabel}</span>
            ) : (
              <span className={styles.fieldValueMuted}>없음</span>
            )}
          </div>
        </div>

        <div className={styles.actionsRow}>
          <button type="button" className={styles.editButton} onClick={onEdit}>
            수정하기
          </button>
        </div>
      </div>
    </div>
  );
}
