"use client";

import { useEffect, useState } from "react";
import styles from "./TrialApplicationPickerModal.module.css";
import type { TrialApplicationForFormat } from "@/lib/trial-application-format";

export type TrialApplicationListItem = TrialApplicationForFormat & { id: number; submittedAt: string };

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/**
 * 킬팻캡슐 3일체험 추천 이벤트(task.md 1-6) — /prescriptions/new의 "체험신청에서
 * 가져오기" 피커. SurveyResponsePickerModal과 동일한 구조(목록 클릭 즉시 선택, 별도
 * 상세화면 없음 — 선택 후 채워지는 설문 textarea가 곧 리뷰 화면).
 */
export default function TrialApplicationPickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (application: TrialApplicationListItem) => void;
  onClose: () => void;
}) {
  const [applications, setApplications] = useState<TrialApplicationListItem[] | null>(null);

  useEffect(() => {
    fetch("/api/trial-applications?unconverted=1")
      .then((res) => res.json())
      .then(setApplications);
  }, []);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>체험 신청에서 가져오기</span>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            닫기
          </button>
        </div>

        {applications === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : applications.length === 0 ? (
          <p className={styles.muted}>미등록 신청이 없습니다.</p>
        ) : (
          <ul className={styles.list}>
            {applications.map((application) => (
              <li key={application.id} className={styles.item} onClick={() => onSelect(application)}>
                <span className={styles.itemName}>{application.name}</span>
                <span className={styles.itemMeta}>
                  {application.phone} · {formatSubmittedAt(application.submittedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
