"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";

type PendingSubmission = {
  id: number;
  submittedAt: string;
  submittedPhotoPath: string | null;
  submittedText: string | null;
  patientName: string;
  chartNumber: string;
  missionTitle: string;
  missionCategory: string;
  rewardAmount: number;
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 미션 승인 대기 큐(/missions/approvals, task.md 3-5) — PENDING_APPROVAL 목록(사진 미리보기/
 * 텍스트 내용) + 승인/반려 버튼.
 */
export default function MissionApprovalsPage() {
  const { currentUser } = useCurrentUserContext();
  const [submissions, setSubmissions] = useState<PendingSubmission[] | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  function load() {
    fetch("/api/missions/approvals")
      .then((res) => res.json())
      .then(setSubmissions);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDecision(id: number, decision: "approve" | "reject") {
    if (!currentUser) {
      alert("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }
    setProcessingId(id);
    try {
      const res = await fetch(`/api/missions/submissions/${id}/${decision}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffUserId: currentUser.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "처리에 실패했습니다.");
        return;
      }
      load();
    } catch {
      alert("서버에 연결하지 못했습니다.");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>미션 승인 대기 큐</h1>
      </div>
      <p className={styles.muted}>사진/텍스트 미션 제출건을 확인하고 승인/반려합니다.</p>

      {submissions === null ? (
        <p className={styles.muted}>불러오는 중...</p>
      ) : submissions.length === 0 ? (
        <p className={styles.muted}>대기중인 제출건이 없습니다.</p>
      ) : (
        submissions.map((s) => (
          <div className={styles.card} key={s.id}>
            <div className={styles.cardHeader}>
              <span className={styles.patientName}>
                {s.patientName} ({s.chartNumber})
              </span>
              <span className={styles.metaText}>
                {s.missionCategory} · {s.missionTitle} · {s.rewardAmount.toLocaleString()}원 ·{" "}
                {formatDateTime(s.submittedAt)}
              </span>
            </div>

            {s.submittedPhotoPath && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.submittedPhotoPath} alt="" className={styles.photoPreview} />
            )}
            {s.submittedText && <p className={styles.contentText}>{s.submittedText}</p>}

            <div className={styles.actionsRow}>
              <button
                type="button"
                className={styles.approveButton}
                disabled={processingId === s.id}
                onClick={() => handleDecision(s.id, "approve")}
              >
                승인
              </button>
              <button
                type="button"
                className={styles.rejectButton}
                disabled={processingId === s.id}
                onClick={() => handleDecision(s.id, "reject")}
              >
                반려
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
