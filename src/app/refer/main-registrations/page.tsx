"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";

type RequestRow = {
  id: number;
  name: string;
  phone: string;
  submittedAt: string;
  status: string;
  workTaskId: number | null;
  referrerPatient: { id: number; name: string; chartNumber: string };
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  CONTACTED: "연락완료",
  CONVERTED: "등록전환",
  NOT_CONVERTED: "미전환",
};
const STATUS_OPTIONS = ["PENDING", "CONTACTED", "CONVERTED", "NOT_CONVERTED"];

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * MAIN 등급 랜딩페이지 "바로 등록하고 할인받기" 신청 전체보기(task.md) — 체험 신청 응답
 * (/refer/applications)과 동일한 목록+클릭펼침 패턴. WorkTask(오늘 할 일 알림)는 완료
 * 처리 후 사라지지만, 이 목록은 신청 이력을 영구 보존해서 언제든 되짚어볼 수 있다.
 * 실제 Prescription 등록/추천인 연결은 이 화면이 아니라 /prescriptions/new "소개
 * 확인"에서 직원이 수동으로 처리하며, 처리상태는 그 진행 상황을 수기로 기록하는 용도.
 */
export default function MainDirectRegistrationRequestsPage() {
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  function refresh() {
    fetch("/api/main-direct-registration-requests")
      .then((res) => res.json())
      .then(setRequests);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleStatusChange(id: number, status: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/main-direct-registration-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        alert("처리상태 변경에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      const updated = await res.json();
      setRequests((prev) => prev?.map((r) => (r.id === id ? { ...r, status: updated.status } : r)) ?? null);
    } catch {
      alert("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>본프로그램 바로등록 신청</h1>
      </div>
      <p className={styles.muted}>
        MAIN 등급 추천링크에서 &quot;바로 등록하고 할인받기&quot;로 접수된 상담 신청 전체
        목록입니다. 클릭하면 상세 내용과 처리상태를 확인/변경할 수 있습니다.
      </p>

      {requests === null ? (
        <p className={styles.muted}>불러오는 중...</p>
      ) : requests.length === 0 ? (
        <p className={styles.muted}>접수된 신청이 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {requests.map((r) => {
            const isExpanded = expandedId === r.id;
            return (
              <li key={r.id} className={styles.item}>
                <button
                  type="button"
                  className={styles.itemHeader}
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                >
                  <span className={styles.itemName}>
                    {r.name}
                    <span className={`${styles.statusTag} ${styles[`status${r.status}`] ?? ""}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </span>
                  <span className={styles.itemMeta}>
                    {r.phone} · {r.referrerPatient.name}님 추천 · {formatSubmittedAt(r.submittedAt)}
                  </span>
                </button>

                {isExpanded && (
                  <div className={styles.detail}>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>연락처</span>
                      <span className={styles.mono}>{r.phone}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>추천인</span>
                      <span>
                        {r.referrerPatient.name}님 (<span className={styles.mono}>{r.referrerPatient.chartNumber}</span>)
                      </span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>신청일시</span>
                      <span className={styles.mono}>{formatSubmittedAt(r.submittedAt)}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>처리상태</span>
                      <div className={styles.statusButtonRow}>
                        {STATUS_OPTIONS.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={s === r.status ? styles.statusButtonActive : styles.statusButton}
                            onClick={() => handleStatusChange(r.id, s)}
                            disabled={savingId === r.id}
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
