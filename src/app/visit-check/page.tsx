"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import SealStamp from "@/components/SealStamp";
import { getCurrentUserId } from "@/lib/currentUser";

type Patient = { id: number; chartNumber: string; name: string };
type TreatmentCategory = { id: number; name: string };
type VisitType = { id: number; name: string };
type StaffUser = { id: number; name: string; role: string };
type VisitRecord = {
  id: number;
  isReserved: boolean;
  patient: Patient;
  treatmentCategory: TreatmentCategory;
  visitType: VisitType;
  checkedByUser: StaffUser | null;
};

export default function VisitCheckPage() {
  const [todayLabel, setTodayLabel] = useState("");

  const [categories, setCategories] = useState<TreatmentCategory[]>([]);
  const [visitTypes, setVisitTypes] = useState<VisitType[]>([]);
  const [todayVisits, setTodayVisits] = useState<VisitRecord[]>([]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [newChartNumber, setNewChartNumber] = useState("");
  const [newName, setNewName] = useState("");
  const [newPatientError, setNewPatientError] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState<string>("");
  const [visitTypeId, setVisitTypeId] = useState<string>("");
  const [isReserved, setIsReserved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stampKey, setStampKey] = useState(0);

  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [currentUserId, setCurrentUserIdState] = useState<number | null>(null);

  useEffect(() => {
    setTodayLabel(
      new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      }).format(new Date()),
    );

    setCurrentUserIdState(getCurrentUserId());

    fetch("/api/treatment-categories")
      .then((res) => res.json())
      .then(setCategories);

    fetch("/api/visit-types")
      .then((res) => res.json())
      .then(setVisitTypes);

    fetch("/api/staff-users")
      .then((res) => res.json())
      .then(setStaffUsers);

    refreshTodayVisits();
  }, []);

  const currentUserName = staffUsers.find((u) => u.id === currentUserId)?.name ?? null;

  function refreshTodayVisits() {
    fetch("/api/visits")
      .then((res) => res.json())
      .then(setTodayVisits);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(query.trim())}`);
      const data: Patient[] = await res.json();
      setResults(data);
      setShowNewPatientForm(data.length === 0);
    } finally {
      setSearching(false);
    }
  }

  function selectPatient(patient: Patient) {
    setSelectedPatient(patient);
    setResults(null);
    setQuery("");
    setShowNewPatientForm(false);
  }

  function clearSelectedPatient() {
    setSelectedPatient(null);
    setCategoryId("");
    setVisitTypeId("");
    setIsReserved(false);
  }

  async function handleCreatePatient(e: React.FormEvent) {
    e.preventDefault();
    setNewPatientError(null);
    const res = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chartNumber: newChartNumber, name: newName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNewPatientError(data.error ?? "환자 등록에 실패했습니다.");
      return;
    }
    setNewChartNumber("");
    setNewName("");
    selectPatient(data);
  }

  async function handleSubmitVisit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!selectedPatient || !categoryId || !visitTypeId) {
      setSubmitError("환자, 진료분야, 진료구분을 모두 선택하세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          treatmentCategoryId: Number(categoryId),
          visitTypeId: Number(visitTypeId),
          isReserved,
          checkedByUserId: getCurrentUserId(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "내원 체크에 실패했습니다.");
        return;
      }
      setTodayVisits((prev) => [data, ...prev]);
      clearSelectedPatient();
      setStampKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>내원체크</h1>
      <div className={styles.dateLabel}>{todayLabel || "오늘"}</div>

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
              <p className={styles.muted}>검색 결과가 없습니다. 신규 환자로 등록하세요.</p>
            )}

            {!showNewPatientForm && (
              <button type="button" onClick={() => setShowNewPatientForm(true)}>
                신규 환자 등록
              </button>
            )}

            {showNewPatientForm && (
              <form className={styles.row} onSubmit={handleCreatePatient}>
                <input
                  className={styles.mono}
                  type="text"
                  placeholder="차트번호"
                  value={newChartNumber}
                  onChange={(e) => setNewChartNumber(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="이름"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <button type="submit">등록</button>
              </form>
            )}
            {newPatientError && <p className={styles.errorText}>{newPatientError}</p>}
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
          <div className={styles.sectionTitle}>내원 체크</div>
          <form onSubmit={handleSubmitVisit}>
            <div className={styles.formRow}>
              <label>
                진료분야{" "}
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">선택</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                진료구분{" "}
                <select value={visitTypeId} onChange={(e) => setVisitTypeId(e.target.value)}>
                  <option value="">선택</option>
                  {visitTypes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={isReserved}
                  onChange={(e) => setIsReserved(e.target.checked)}
                />{" "}
                예약함
              </label>
            </div>

            {submitError && <p className={styles.errorText}>{submitError}</p>}

            <p className={styles.muted}>
              체크자: {currentUserName ?? "미선택 (상단에서 현재 사용자를 선택하세요)"}
            </p>

            <span className={styles.submitWrap}>
              <button className={styles.submitButton} type="submit" disabled={submitting}>
                체크 완료
              </button>
              {stampKey > 0 && <SealStamp key={stampKey} />}
            </span>
          </form>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>오늘 체크된 내원 목록 ({todayVisits.length}건)</div>
        {todayVisits.length === 0 ? (
          <p className={styles.muted}>아직 체크된 내원이 없습니다.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>환자명</th>
                <th>진료분야</th>
                <th>진료구분</th>
                <th>예약여부</th>
                <th>체크한 사람</th>
              </tr>
            </thead>
            <tbody>
              {todayVisits.map((v) => (
                <tr key={v.id}>
                  <td>{v.patient.name}</td>
                  <td>{v.treatmentCategory.name}</td>
                  <td>{v.visitType.name}</td>
                  <td>{v.isReserved ? "예약함" : "예약안함"}</td>
                  <td>{v.checkedByUser?.name ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
