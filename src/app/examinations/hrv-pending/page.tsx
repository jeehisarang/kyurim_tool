"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import { getCurrentUserId } from "@/lib/currentUser";

type PendingRow = {
  id: number;
  userName: string;
  gender: string | null;
  birthYear: number | null;
  age: number | null;
  rawChartNumber: string | null;
  measuredAt: string;
  vascularHealthIndex: number | null;
  vascularHealthType: string | null;
  avgPulse: number | null;
  stressIndex: number | null;
  capturedImagePath: string | null;
  sourceFile: string;
};

type Patient = { id: number; chartNumber: string; name: string };

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 미매칭 검사기록 대기열(task.md, 유비오맥파 CSV 자동연동) — CSV의 "번호"(차트번호)가
 * 비어있거나 실제 환자와 매칭 안 된 행을 여기서 직원이 수동으로 환자를 지정해 정식
 * HrvTestRecord로 전환한다. GET이 매번 스캔부터 하므로 새로고침만 해도 최신 상태가 된다.
 */
export default function HrvImportPendingPage() {
  const [rows, setRows] = useState<PendingRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
  const [searchResults, setSearchResults] = useState<Record<number, Patient[]>>({});
  const [selectedPatients, setSelectedPatients] = useState<Record<number, Patient>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});

  function load() {
    setLoadError(false);
    fetch("/api/hrv-imports/pending")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then(setRows)
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSearch(rowId: number) {
    const q = searchQueries[rowId]?.trim();
    if (!q) return;
    const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}`);
    const data: Patient[] = await res.json();
    setSearchResults((prev) => ({ ...prev, [rowId]: data }));
  }

  async function handleResolve(rowId: number) {
    const patient = selectedPatients[rowId];
    const staffUserId = getCurrentUserId();
    if (!patient) return;
    if (!staffUserId) {
      setErrors((prev) => ({ ...prev, [rowId]: "상단에서 현재 사용자를 먼저 선택하세요." }));
      return;
    }
    setBusyId(rowId);
    setErrors((prev) => ({ ...prev, [rowId]: "" }));
    try {
      const res = await fetch(`/api/hrv-imports/pending/${rowId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: patient.id, staffUserId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [rowId]: data.error ?? "전환에 실패했습니다." }));
        return;
      }
      setRows((prev) => (prev ? prev.filter((r) => r.id !== rowId) : prev));
    } catch {
      setErrors((prev) => ({ ...prev, [rowId]: "서버에 연결하지 못했습니다. 다시 시도해주세요." }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleIgnore(rowId: number) {
    const staffUserId = getCurrentUserId();
    if (!staffUserId) {
      setErrors((prev) => ({ ...prev, [rowId]: "상단에서 현재 사용자를 먼저 선택하세요." }));
      return;
    }
    if (!window.confirm("이 검사기록을 무시하시겠습니까? (검사기록으로 전환되지 않고 목록에서만 사라집니다)")) {
      return;
    }
    setBusyId(rowId);
    try {
      await fetch(`/api/hrv-imports/pending/${rowId}/ignore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffUserId }),
      });
      setRows((prev) => (prev ? prev.filter((r) => r.id !== rowId) : prev));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.titleGroup}>
          <BackButton />
          <h1 className={styles.pageTitle}>미매칭 검사기록</h1>
        </div>
      </div>
      <p className={styles.muted}>
        유비오맥파 CSV에서 차트번호가 비어있거나 매칭되는 환자를 찾지 못한 검사기록입니다. 환자를 지정하면 정식
        검사기록으로 전환됩니다.
      </p>

      {loadError && <p className={styles.errorText}>목록을 불러오지 못했습니다.</p>}
      {!loadError && rows === null && <p className={styles.muted}>불러오는 중...</p>}
      {!loadError && rows !== null && rows.length === 0 && <p className={styles.muted}>대기 중인 검사기록이 없습니다.</p>}

      {rows && rows.length > 0 && (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.id} className={styles.card}>
              <div className={styles.cardMain}>
                {row.capturedImagePath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.capturedImagePath} alt="" className={styles.thumbnail} />
                )}
                <div className={styles.cardInfo}>
                  <div className={styles.cardTitle}>
                    {row.userName}
                    <span className={styles.muted}>
                      {" "}
                      ({row.gender ?? "성별 미상"} · {row.birthYear ? `${row.birthYear}년생` : "출생년도 미상"}
                      {row.age ? ` · ${row.age}세` : ""})
                    </span>
                  </div>
                  <div className={styles.muted}>측정일시: {formatDateTime(row.measuredAt)}</div>
                  <div className={styles.muted}>
                    CSV 번호(원본): {row.rawChartNumber ?? "(비어있음)"} · 출처파일: {row.sourceFile}
                  </div>
                  <div className={styles.metricPreview}>
                    혈관건강지수 {row.vascularHealthIndex ?? "-"} · 혈관건강도 {row.vascularHealthType ?? "-"} ·
                    평균맥박 {row.avgPulse ?? "-"} · 스트레스지수 {row.stressIndex ?? "측정 안 함"}
                  </div>
                </div>
              </div>

              <div className={styles.resolveRow}>
                {selectedPatients[row.id] ? (
                  <span className={styles.selectedPatient}>
                    선택됨: <strong>{selectedPatients[row.id].name}</strong> ({selectedPatients[row.id].chartNumber})
                    <button
                      type="button"
                      className={styles.smallButton}
                      onClick={() => setSelectedPatients((prev) => { const next = { ...prev }; delete next[row.id]; return next; })}
                    >
                      변경
                    </button>
                  </span>
                ) : (
                  <>
                    <input
                      type="text"
                      className={styles.searchInput}
                      placeholder="차트번호 또는 이름"
                      value={searchQueries[row.id] ?? ""}
                      onChange={(e) => setSearchQueries((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch(row.id)}
                    />
                    <button type="button" className={styles.smallButton} onClick={() => handleSearch(row.id)}>
                      검색
                    </button>
                    {searchResults[row.id] && searchResults[row.id].length > 0 && (
                      <ul className={styles.searchResultList}>
                        {searchResults[row.id].map((p) => (
                          <li key={p.id} onClick={() => setSelectedPatients((prev) => ({ ...prev, [row.id]: p }))}>
                            {p.name} ({p.chartNumber})
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                <button
                  type="button"
                  className={styles.resolveButton}
                  disabled={!selectedPatients[row.id] || busyId === row.id}
                  onClick={() => handleResolve(row.id)}
                >
                  {busyId === row.id ? "처리 중..." : "검사기록으로 전환"}
                </button>
                <button
                  type="button"
                  className={styles.ignoreButton}
                  disabled={busyId === row.id}
                  onClick={() => handleIgnore(row.id)}
                >
                  무시
                </button>
              </div>
              {errors[row.id] && <p className={styles.errorText}>{errors[row.id]}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
