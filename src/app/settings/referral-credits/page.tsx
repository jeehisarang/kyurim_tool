"use client";

import { Fragment, useEffect, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";

type CreditEntry = {
  id: number;
  kind: string;
  amount: number;
  referredName: string;
  createdAt: string;
  confirmedByStaffName: string | null;
};

type PatientSummary = {
  patientId: number;
  patientName: string;
  chartNumber: string;
  trialTotal: number;
  mainTotal: number;
  total: number;
  entries: CreditEntry[];
};

const KIND_LABEL: Record<string, string> = { TRIAL_SIGNUP: "체험 추천", MAIN_SIGNUP: "본프로그램 추천" };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/**
 * 원장 전용 적립 현황 화면(task.md Phase 3-3) — 환자를 가로질러 TRIAL_SIGNUP/MAIN_SIGNUP
 * 적립 전체를 환자별로 묶어 보여준다. 처방상세의 개별 표시(링크 1개 기준)와 별개.
 */
export default function ReferralCreditsSettingsPage() {
  const { currentUser } = useCurrentUserContext();
  const isDirector = currentUser?.role === "원장";

  const [summary, setSummary] = useState<PatientSummary[] | null>(null);
  const [expandedPatientId, setExpandedPatientId] = useState<number | null>(null);

  useEffect(() => {
    if (!isDirector) return;
    fetch("/api/referral-credits")
      .then((res) => res.json())
      .then(setSummary);
  }, [isDirector]);

  const grandTotal = summary?.reduce((sum, p) => sum + p.total, 0) ?? 0;
  const grandTrialTotal = summary?.reduce((sum, p) => sum + p.trialTotal, 0) ?? 0;
  const grandMainTotal = summary?.reduce((sum, p) => sum + p.mainTotal, 0) ?? 0;

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>추천 적립 현황</h1>
      </div>

      {!isDirector ? (
        <p className={styles.muted}>원장만 볼 수 있습니다.</p>
      ) : summary === null ? (
        <p className={styles.muted}>불러오는 중...</p>
      ) : summary.length === 0 ? (
        <p className={styles.muted}>적립 내역이 없습니다.</p>
      ) : (
        <>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>전체 합계</div>
            <div className={styles.summaryRow}>
              <span>체험 추천(TRIAL_SIGNUP): {grandTrialTotal.toLocaleString()}원</span>
              <span>본프로그램 추천(MAIN_SIGNUP): {grandMainTotal.toLocaleString()}원</span>
              <strong>총합: {grandTotal.toLocaleString()}원</strong>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>환자별 적립 현황 ({summary.length}명)</div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>환자</th>
                  <th>체험 추천</th>
                  <th>본프로그램 추천</th>
                  <th>합계</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {summary.map((p) => (
                  <Fragment key={p.patientId}>
                    <tr>
                      <td>
                        {p.patientName} (<span className={styles.mono}>{p.chartNumber}</span>)
                      </td>
                      <td className={styles.mono}>{p.trialTotal.toLocaleString()}원</td>
                      <td className={styles.mono}>{p.mainTotal.toLocaleString()}원</td>
                      <td className={styles.mono}>{p.total.toLocaleString()}원</td>
                      <td>
                        <button
                          type="button"
                          className={styles.expandButton}
                          onClick={() =>
                            setExpandedPatientId((prev) => (prev === p.patientId ? null : p.patientId))
                          }
                        >
                          {expandedPatientId === p.patientId ? "접기" : `내역 ${p.entries.length}건`}
                        </button>
                      </td>
                    </tr>
                    {expandedPatientId === p.patientId && (
                      <tr>
                        <td colSpan={5}>
                          <table className={styles.detailTable}>
                            <thead>
                              <tr>
                                <th>구분</th>
                                <th>추천받은 사람</th>
                                <th>금액</th>
                                <th>확정 직원</th>
                                <th>일시</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.entries.map((entry) => (
                                <tr key={entry.id}>
                                  <td>{KIND_LABEL[entry.kind] ?? entry.kind}</td>
                                  <td>{entry.referredName}</td>
                                  <td className={styles.mono}>{entry.amount.toLocaleString()}원</td>
                                  <td>{entry.confirmedByStaffName ?? "-"}</td>
                                  <td className={styles.mono}>{formatDate(entry.createdAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
