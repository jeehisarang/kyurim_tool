"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import CreditUsageModal from "@/components/CreditUsageModal";
import EditCreditUsageModal from "@/components/EditCreditUsageModal";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";

type CreditEntry = {
  id: number;
  kind: string;
  amount: number;
  status: string;
  referredName: string;
  createdAt: string;
  confirmedByStaffName: string | null;
};

type PatientSummary = {
  patientId: number;
  patientName: string;
  chartNumber: string;
  maxTotal: number;
  confirmedTotal: number;
  // 잔액 현황(task.md 신규) — /api/referral-credits가 listReferralCreditSummary 결과에
  // usage 합계를 더해서 내려준다.
  totalUsed: number;
  balance: number;
  entries: CreditEntry[];
};

type UsageRecord = {
  id: number;
  amount: number;
  memo: string | null;
  usedAt: string;
  staffUserName: string;
  isCancelled: boolean;
  cancelledAt: string | null;
  editedAt: string | null;
};

const KIND_LABEL: Record<string, string> = {
  TRIAL_SIGNUP: "체험 추천",
  MAIN_SIGNUP: "본프로그램 추천",
  EXIT_SURVEY_COMPLETION: "마감설문 작성",
};
const STATUS_LABEL: Record<string, string> = { PENDING: "대기중", CONFIRMED: "확정" };

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
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  // 잔액 현황(task.md 신규) — 검색/필터, "사용 처리" 모달 대상 환자.
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyWithBalance, setOnlyWithBalance] = useState(false);
  const [usageModalPatient, setUsageModalPatient] = useState<PatientSummary | null>(null);

  // 사용내역 수정/취소(task.md 신규) — 환자별 사용내역은 펼칠 때만 조회(lazy load)해서 캐시해둔다.
  const [expandedUsagePatientId, setExpandedUsagePatientId] = useState<number | null>(null);
  const [usageByPatient, setUsageByPatient] = useState<Record<number, UsageRecord[] | undefined>>({});
  const [editingUsage, setEditingUsage] = useState<{ usage: UsageRecord; patientId: number; patientName: string } | null>(null);
  const [cancellingUsageId, setCancellingUsageId] = useState<number | null>(null);

  function loadSummary() {
    fetch("/api/referral-credits")
      .then((res) => res.json())
      .then(setSummary);
  }

  function loadUsageForPatient(patientId: number) {
    return fetch(`/api/referral-credits/usage?patientId=${patientId}`)
      .then((res) => res.json())
      .then((data: UsageRecord[]) => {
        setUsageByPatient((prev) => ({ ...prev, [patientId]: data }));
        return data;
      });
  }

  function toggleUsageExpand(patientId: number) {
    if (expandedUsagePatientId === patientId) {
      setExpandedUsagePatientId(null);
      return;
    }
    setExpandedUsagePatientId(patientId);
    if (!usageByPatient[patientId]) {
      loadUsageForPatient(patientId);
    }
  }

  async function handleCancelUsage(usage: UsageRecord, patientId: number) {
    if (!currentUser) return;
    if (!confirm("이 사용내역을 삭제하시겠습니까? 삭제하면 해당 금액만큼 잔액이 복구됩니다")) return;
    setCancellingUsageId(usage.id);
    try {
      const res = await fetch(`/api/referral-credits/usage/${usage.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffUserId: currentUser.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "취소에 실패했습니다.");
        return;
      }
      await loadUsageForPatient(patientId);
      loadSummary();
    } catch {
      alert("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setCancellingUsageId(null);
    }
  }

  useEffect(() => {
    if (!isDirector) return;
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirector]);

  // "결제 완료 확인"(task.md 추천 이벤트 개선 4-2) — MAIN_SIGNUP PENDING 적립을 CONFIRMED로
  // 전환. TRIAL_SIGNUP은 등록 시점에 자동 전환되므로 여기서 다루지 않는다.
  async function handleConfirm(entryId: number) {
    if (!currentUser) return;
    setConfirmingId(entryId);
    try {
      const res = await fetch(`/api/referral-credits/${entryId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffUserId: currentUser.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "확정 처리에 실패했습니다.");
        return;
      }
      loadSummary();
    } catch {
      alert("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setConfirmingId(null);
    }
  }

  const grandMaxTotal = summary?.reduce((sum, p) => sum + p.maxTotal, 0) ?? 0;
  const grandConfirmedTotal = summary?.reduce((sum, p) => sum + p.confirmedTotal, 0) ?? 0;
  const grandUsedTotal = summary?.reduce((sum, p) => sum + p.totalUsed, 0) ?? 0;
  const grandBalanceTotal = summary?.reduce((sum, p) => sum + p.balance, 0) ?? 0;

  // 검색(이름/차트번호, 오늘 추가한 /prescriptions 화면과 동일한 패턴) + 잔액 있는 환자만 필터.
  const filteredSummary = useMemo(() => {
    if (!summary) return [];
    let result = summary;
    const q = searchQuery.trim();
    if (q) {
      result = result.filter((p) => p.patientName.includes(q) || p.chartNumber.includes(q));
    }
    if (onlyWithBalance) {
      result = result.filter((p) => p.balance > 0);
    }
    return result;
  }, [summary, searchQuery, onlyWithBalance]);

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
              <span>최대 적립금 합계: {grandMaxTotal.toLocaleString()}원</span>
              <span>확정 적립금 합계: {grandConfirmedTotal.toLocaleString()}원</span>
              <span>총 사용액 합계: {grandUsedTotal.toLocaleString()}원</span>
              <strong>잔액 합계: {grandBalanceTotal.toLocaleString()}원</strong>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>환자별 적립 현황 ({filteredSummary.length}명)</div>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="차트번호 또는 이름으로 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={onlyWithBalance}
                onChange={(e) => setOnlyWithBalance(e.target.checked)}
              />
              잔액 있는 환자만
            </label>
            {filteredSummary.length === 0 ? (
              <p className={styles.muted}>조건에 맞는 환자가 없습니다.</p>
            ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>환자</th>
                  <th>총 적립액</th>
                  <th>총 사용액</th>
                  <th>잔액</th>
                  <th />
                  <th />
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredSummary.map((p) => (
                  <Fragment key={p.patientId}>
                    <tr>
                      <td>
                        {p.patientName} (<span className={styles.mono}>{p.chartNumber}</span>)
                      </td>
                      <td className={styles.mono}>{p.confirmedTotal.toLocaleString()}원</td>
                      <td className={styles.mono}>{p.totalUsed.toLocaleString()}원</td>
                      <td className={styles.mono}>
                        <strong>{p.balance.toLocaleString()}원</strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.expandButton}
                          onClick={() => setUsageModalPatient(p)}
                        >
                          사용 처리
                        </button>
                      </td>
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
                      <td>
                        <button
                          type="button"
                          className={styles.expandButton}
                          onClick={() => toggleUsageExpand(p.patientId)}
                        >
                          {expandedUsagePatientId === p.patientId ? "접기" : "사용내역"}
                        </button>
                      </td>
                    </tr>
                    {expandedPatientId === p.patientId && (
                      <tr>
                        <td colSpan={7}>
                          <table className={styles.detailTable}>
                            <thead>
                              <tr>
                                <th>구분</th>
                                <th>상태</th>
                                <th>추천받은 사람</th>
                                <th>금액</th>
                                <th>확정 직원</th>
                                <th>일시</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {p.entries.map((entry) => (
                                <tr key={entry.id}>
                                  <td>{KIND_LABEL[entry.kind] ?? entry.kind}</td>
                                  <td>{STATUS_LABEL[entry.status] ?? entry.status}</td>
                                  <td>{entry.referredName}</td>
                                  <td className={styles.mono}>{entry.amount.toLocaleString()}원</td>
                                  <td>{entry.confirmedByStaffName ?? "-"}</td>
                                  <td className={styles.mono}>{formatDate(entry.createdAt)}</td>
                                  <td>
                                    {entry.kind === "MAIN_SIGNUP" && entry.status === "PENDING" && (
                                      <button
                                        type="button"
                                        className={styles.expandButton}
                                        disabled={confirmingId === entry.id}
                                        onClick={() => handleConfirm(entry.id)}
                                      >
                                        {confirmingId === entry.id ? "처리 중..." : "결제 완료 확인"}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                    {expandedUsagePatientId === p.patientId && (
                      <tr>
                        <td colSpan={7}>
                          {usageByPatient[p.patientId] === undefined ? (
                            <p className={styles.muted}>불러오는 중...</p>
                          ) : usageByPatient[p.patientId]!.length === 0 ? (
                            <p className={styles.muted}>사용 내역이 없습니다.</p>
                          ) : (
                            <table className={styles.detailTable}>
                              <thead>
                                <tr>
                                  <th>금액</th>
                                  <th>사용일</th>
                                  <th>메모</th>
                                  <th>처리 직원</th>
                                  <th>상태</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {usageByPatient[p.patientId]!.map((u) => (
                                  <tr key={u.id}>
                                    <td className={styles.mono}>{u.amount.toLocaleString()}원</td>
                                    <td className={styles.mono}>{formatDate(u.usedAt)}</td>
                                    <td>{u.memo ?? "-"}</td>
                                    <td>{u.staffUserName}</td>
                                    <td>
                                      {u.isCancelled
                                        ? `취소됨${u.cancelledAt ? ` (${formatDate(u.cancelledAt)})` : ""}`
                                        : u.editedAt
                                          ? `수정됨 (${formatDate(u.editedAt)})`
                                          : "-"}
                                    </td>
                                    <td>
                                      {!u.isCancelled && (
                                        <>
                                          <button
                                            type="button"
                                            className={styles.expandButton}
                                            onClick={() =>
                                              setEditingUsage({ usage: u, patientId: p.patientId, patientName: p.patientName })
                                            }
                                          >
                                            수정
                                          </button>{" "}
                                          <button
                                            type="button"
                                            className={styles.expandButton}
                                            disabled={cancellingUsageId === u.id}
                                            onClick={() => handleCancelUsage(u, p.patientId)}
                                          >
                                            {cancellingUsageId === u.id ? "처리 중..." : "삭제"}
                                          </button>
                                        </>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </>
      )}

      {usageModalPatient && currentUser && (
        <CreditUsageModal
          patientId={usageModalPatient.patientId}
          patientName={usageModalPatient.patientName}
          currentBalance={usageModalPatient.balance}
          staffUserId={currentUser.id}
          onClose={() => setUsageModalPatient(null)}
          onSaved={loadSummary}
        />
      )}

      {editingUsage && currentUser && (
        <EditCreditUsageModal
          usageId={editingUsage.usage.id}
          patientName={editingUsage.patientName}
          initialAmount={editingUsage.usage.amount}
          initialUsedAt={editingUsage.usage.usedAt}
          staffUserId={currentUser.id}
          onClose={() => setEditingUsage(null)}
          onSaved={() => {
            loadUsageForPatient(editingUsage.patientId);
            loadSummary();
          }}
        />
      )}
    </div>
  );
}
