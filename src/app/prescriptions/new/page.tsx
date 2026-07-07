"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import SealStamp from "@/components/SealStamp";
import { getCurrentUserId } from "@/lib/currentUser";

type Patient = { id: number; chartNumber: string; name: string };
type Program = { id: number; name: string; type: string };
type StaffUser = { id: number; name: string; role: string };

const PROGRAM_TYPE_FIXED_SEQUENCE = "FIXED_SEQUENCE";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export default function NewPrescriptionPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [programId, setProgramId] = useState("");
  const [staffUserId, setStaffUserId] = useState("");
  const [surveyDataJson, setSurveyDataJson] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stampKey, setStampKey] = useState(0);
  const [lastRegistered, setLastRegistered] = useState<{
    patientName: string;
    programName: string;
    startDate: string;
  } | null>(null);

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
    setSurveyDataJson("");
  }

  const selectedProgram = programs.find((p) => String(p.id) === programId) ?? null;
  const isTrialSurveyProgram = selectedProgram?.type === PROGRAM_TYPE_FIXED_SEQUENCE;

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
          surveyDataJson: isTrialSurveyProgram ? surveyDataJson : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "처방 등록에 실패했습니다.");
        return;
      }
      // 환자는 그대로 유지 — 같은 환자를 다른 프로그램에 바로 이어서 등록할 수 있게(중복 등록 흐름).
      setLastRegistered({
        patientName: selectedPatient.name,
        programName: selectedProgram?.name ?? "",
        startDate: data.startDate,
      });
      setProgramId("");
      setSurveyDataJson("");
      setStampKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>치료처방 등록</h1>
        <Link href="/prescriptions" className={styles.listLink}>
          ← 치료처방 목록
        </Link>
      </div>

      {lastRegistered && (
        <div className={styles.successBanner}>
          ✅ 처방이 등록되었습니다 — <strong>{lastRegistered.patientName}</strong>님 ·{" "}
          {lastRegistered.programName} ({formatDate(lastRegistered.startDate)} 시작)
        </div>
      )}

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

            {isTrialSurveyProgram && (
              <label className={styles.surveyLabel}>
                설문 데이터 (수동 입력, 자유 형식)
                <textarea
                  className={styles.surveyTextarea}
                  rows={4}
                  placeholder="예: 체중 68kg, 목표 3kg 감량, 야식 자주 먹음 등 — 구글폼 응답을 보고 자유롭게 입력하세요."
                  value={surveyDataJson}
                  onChange={(e) => setSurveyDataJson(e.target.value)}
                />
              </label>
            )}
            {/* 정형 스키마 아님 — 지금은 직원이 구글폼 응답을 보고 수동 입력. 13-3(구글폼 실시간
                연동) 적용 시 이 값을 자동 파싱 결과로 채우는 방식으로 확장 예정(프롬프트 조립
                코드는 그대로 두고 이 필드를 채우는 방식만 바뀌면 됨). */}

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
