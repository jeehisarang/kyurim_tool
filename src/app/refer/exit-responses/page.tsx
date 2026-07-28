"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";

type ExitSurveyResponseRow = {
  id: number;
  prescriptionId: number;
  patientId: number;
  patientName: string;
  chartNumber: string;
  programName: string;
  compliance: string;
  changes: string[];
  consultInterest: string;
  comment: string | null;
  submittedAt: string;
  workTask: { id: number; isDone: boolean; doneAt: string | null } | null;
};

const CONSULT_FILTER_TABS = ["전체", "희망만"] as const;
type ConsultFilter = (typeof CONSULT_FILTER_TABS)[number];

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 마감설문 응답 전체보기(/refer/exit-responses, task.md) — /refer/applications(신청응답
 * 전체보기)와 동일한 목록+확장상세 패턴. 상담희망("네"/"고민중")은 배지로 하이라이트하고,
 * 연동된 "본상담 예약 요청" 콜백 업무의 완료/미완료 상태도 상세보기에서 함께 확인할 수 있다.
 */
export default function ExitSurveyResponsesPage() {
  const [responses, setResponses] = useState<ExitSurveyResponseRow[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [consultFilter, setConsultFilter] = useState<ConsultFilter>("전체");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    fetch("/api/exit-survey-responses")
      .then((res) => res.json())
      .then(setResponses);
  }, []);

  const filtered = useMemo(() => {
    if (!responses) return [];
    let result = responses;
    if (consultFilter === "희망만") {
      result = result.filter((r) => r.consultInterest === "네" || r.consultInterest === "고민중");
    }
    if (fromDate) {
      const from = new Date(fromDate);
      result = result.filter((r) => new Date(r.submittedAt) >= from);
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      result = result.filter((r) => new Date(r.submittedAt) <= to);
    }
    return result;
  }, [responses, consultFilter, fromDate, toDate]);

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>마감설문 응답</h1>
      </div>
      <p className={styles.muted}>
        킬팻캡슐 3일체험 마감설문(/refer/exit/[prescriptionId])으로 접수된 전체 응답 목록입니다.
      </p>

      <div className={styles.filterRow}>
        <div className={styles.filterTabs}>
          {CONSULT_FILTER_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`${styles.filterTab} ${consultFilter === tab ? styles.filterTabActive : ""}`}
              onClick={() => setConsultFilter(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className={styles.dateFilterRow}>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <span>~</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </div>

      {responses === null ? (
        <p className={styles.muted}>불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p className={styles.muted}>조건에 맞는 응답이 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {filtered.map((r) => {
            const isExpanded = expandedId === r.id;
            const isInterested = r.consultInterest === "네" || r.consultInterest === "고민중";
            return (
              <li key={r.id} className={styles.item}>
                <button
                  type="button"
                  className={styles.itemHeader}
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                >
                  <span className={styles.itemName}>
                    {r.patientName}
                    {isInterested && <span className={styles.consultTag}>상담희망: {r.consultInterest}</span>}
                  </span>
                  <span className={styles.itemMeta}>
                    {r.chartNumber} · {r.programName} · {formatSubmittedAt(r.submittedAt)} · 복용여부 {r.compliance}
                  </span>
                  {r.changes.length > 0 && (
                    <span className={styles.changeTags}>
                      {r.changes.map((c) => (
                        <span key={c} className={styles.changeTag}>
                          {c}
                        </span>
                      ))}
                    </span>
                  )}
                  {r.comment && <span className={styles.commentPreview}>{r.comment}</span>}
                </button>

                {isExpanded && (
                  <div className={styles.detail}>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>환자</span>
                      <span>
                        {r.patientName} ({r.chartNumber})
                      </span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>처방(프로그램)</span>
                      <span>
                        {r.programName} (#{r.prescriptionId})
                      </span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>제출시각</span>
                      <span>{formatSubmittedAt(r.submittedAt)}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>복용여부</span>
                      <span>{r.compliance}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>변화</span>
                      <span>{r.changes.length > 0 ? r.changes.join(", ") : "없음"}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>상담희망</span>
                      <span>{r.consultInterest}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>코멘트</span>
                      <span>{r.comment || "없음"}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>연동 콜백 업무</span>
                      <span>
                        {r.workTask ? (
                          r.workTask.isDone ? (
                            <span className={styles.workTaskDone}>
                              완료됨{r.workTask.doneAt ? ` (${formatSubmittedAt(r.workTask.doneAt)})` : ""}
                            </span>
                          ) : (
                            <span className={styles.workTaskPending}>미완료 — /todo에서 처리 필요</span>
                          )
                        ) : (
                          "해당없음(상담희망 아니오)"
                        )}
                      </span>
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
