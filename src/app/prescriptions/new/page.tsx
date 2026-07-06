"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import SealStamp from "@/components/SealStamp";
import { getCurrentUserId } from "@/lib/currentUser";

type Patient = { id: number; chartNumber: string; name: string };
type Program = { id: number; name: string };
type StaffUser = { id: number; name: string; role: string };

export default function NewPrescriptionPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [programId, setProgramId] = useState("");
  const [staffUserId, setStaffUserId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stampKey, setStampKey] = useState(0);

  useEffect(() => {
    fetch("/api/programs")
      .then((res) => res.json())
      .then(setPrograms);

    fetch("/api/staff-users")
      .then((res) => res.json())
      .then((users: StaffUser[]) => {
        setStaffUsers(users);
        const currentUserId = getCurrentUserId();
        if (currentUserId) setStaffUserId(String(currentUserId));
      });
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(query.trim())}`);
      const data: Patient[] = await res.json();
      setResults(data);
    } finally {
      setSearching(false);
    }
  }

  function selectPatient(patient: Patient) {
    setSelectedPatient(patient);
    setResults(null);
    setQuery("");
  }

  function clearSelectedPatient() {
    setSelectedPatient(null);
    setProgramId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!selectedPatient || !programId || !staffUserId) {
      setSubmitError("환자, 프로그램, 담당자를 모두 선택하세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          programId: Number(programId),
          staffUserId: Number(staffUserId),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "처방 등록에 실패했습니다.");
        return;
      }
      clearSelectedPatient();
      setStampKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>처방 등록</h1>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>환자 검색</div>

        {!selectedPatient && (
          <>
            <form className={styles.row} onSubmit={handleSearch}>
              <input
                type="text"
                placeholder="차트번호 또는 이름"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" disabled={searching}>
                검색
              </button>
            </form>

            {results !== null && results.length > 0 && (
              <ul className={styles.resultList}>
                {results.map((p) => (
                  <li key={p.id} onClick={() => selectPatient(p)}>
                    {p.name} (<span className={styles.mono}>{p.chartNumber}</span>)
                  </li>
                ))}
              </ul>
            )}

            {results !== null && results.length === 0 && (
              <p className={styles.muted}>검색 결과가 없습니다.</p>
            )}
          </>
        )}

        {selectedPatient && (
          <div className={styles.selectedPatient}>
            <span>
              선택된 환자: <strong>{selectedPatient.name}</strong> (
              <span className={styles.mono}>{selectedPatient.chartNumber}</span>)
            </span>
            <button type="button" onClick={clearSelectedPatient}>
              다른 환자 선택
            </button>
          </div>
        )}
      </div>

      {selectedPatient && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>처방 정보</div>
          <form onSubmit={handleSubmit}>
            <div className={styles.formRow}>
              <label>
                프로그램{" "}
                <select value={programId} onChange={(e) => setProgramId(e.target.value)}>
                  <option value="">선택</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                담당자{" "}
                <select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)}>
                  <option value="">선택</option>
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {submitError && <p className={styles.errorText}>{submitError}</p>}

            <span className={styles.submitWrap}>
              <button className={styles.submitButton} type="submit" disabled={submitting}>
                처방 등록
              </button>
              {stampKey > 0 && <SealStamp key={stampKey} />}
            </span>
          </form>
        </div>
      )}
    </div>
  );
}
