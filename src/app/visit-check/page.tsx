"use client";

import { Fragment, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import ExamButton from "@/components/ExamButton";
import NewPatientForm from "@/components/NewPatientForm";
import SealStamp from "@/components/SealStamp";
import PatientNotes from "@/components/PatientNotes";
import CategoryBadge from "@/components/CategoryBadge";
import VisitTypeTag from "@/components/VisitTypeTag";
import ProgramBadge from "@/components/ProgramBadge";
import { getCurrentUserId } from "@/lib/currentUser";

type ActivePrescriptionGroup = {
  patient: { id: number };
  prescriptions: { program: { id: number; name: string } }[];
};

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

const WEEKDAY_FULL_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateParam(value: string | null): Date {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return startOfDay(new Date());
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function formatFullLabel(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY_FULL_LABELS[date.getDay()]})`;
}

export default function VisitCheckPage() {
  return (
    <Suspense fallback={null}>
      <VisitCheckPageInner />
    </Suspense>
  );
}

function VisitCheckPageInner() {
  const searchParams = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(() => parseDateParam(searchParams.get("date")));

  const [categories, setCategories] = useState<TreatmentCategory[]>([]);
  const [visitTypes, setVisitTypes] = useState<VisitType[]>([]);
  const [visits, setVisits] = useState<VisitRecord[]>([]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // 이번 세션에서 신규 등록 폼으로 방금 만든 환자인지 — "다른 환자 선택" 시 아직
  // Visit이 하나도 없다면 되돌리기(삭제) 확인창을 띄울지 판단하는 데 쓴다.
  const [isFreshlyRegisteredPatient, setIsFreshlyRegisteredPatient] = useState(false);

  const [patientEditOpen, setPatientEditOpen] = useState(false);
  const [editChartNumber, setEditChartNumber] = useState("");
  const [editName, setEditName] = useState("");
  const [patientEditError, setPatientEditError] = useState<string | null>(null);
  const [patientEditSaving, setPatientEditSaving] = useState(false);

  const [categoryId, setCategoryId] = useState<string>("");
  const [visitTypeId, setVisitTypeId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stampKey, setStampKey] = useState(0);

  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [currentUserId, setCurrentUserIdState] = useState<number | null>(null);
  const [expandedNotePatientId, setExpandedNotePatientId] = useState<number | null>(null);
  // 환자별 진행중 치료처방 배지 표시용 — /prescriptions 목록과 동일한 데이터 재사용.
  const [activePrescByPatientId, setActivePrescByPatientId] = useState<
    Map<number, { id: number; name: string }[]>
  >(new Map());

  const [editingVisitId, setEditingVisitId] = useState<number | null>(null);
  const [editVisitCategoryId, setEditVisitCategoryId] = useState("");
  const [editVisitTypeId, setEditVisitTypeId] = useState("");
  const [editVisitSaving, setEditVisitSaving] = useState(false);
  const [editVisitError, setEditVisitError] = useState<string | null>(null);
  const [togglingReservedId, setTogglingReservedId] = useState<number | null>(null);

  useEffect(() => {
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

    fetch("/api/prescriptions/list")
      .then((res) => res.json())
      .then((groups: ActivePrescriptionGroup[]) => {
        const map = new Map<number, { id: number; name: string }[]>();
        for (const g of groups) {
          map.set(
            g.patient.id,
            g.prescriptions.map((p) => p.program),
          );
        }
        setActivePrescByPatientId(map);
      });
  }, []);

  useEffect(() => {
    refreshVisits(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const currentUserName = staffUsers.find((u) => u.id === currentUserId)?.name ?? null;

  function refreshVisits(date: Date) {
    fetch(`/api/visits?date=${toDateParam(date)}`)
      .then((res) => res.json())
      .then(setVisits);
  }

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

  function selectPatient(patient: Patient, options?: { freshlyRegistered?: boolean }) {
    setSelectedPatient(patient);
    setResults(null);
    setQuery("");
    setPatientEditOpen(false);
    setIsFreshlyRegisteredPatient(options?.freshlyRegistered ?? false);
  }

  function clearSelectedPatient() {
    setSelectedPatient(null);
    setCategoryId("");
    setVisitTypeId("");
    setPatientEditOpen(false);
    setIsFreshlyRegisteredPatient(false);
  }

  /**
   * "다른 환자 선택" — 방금 신규 등록 폼으로 만든 환자이고 아직 내원 체크가 하나도
   * 없다면, 되돌아가기 전에 그 환자를 지울지 확인한다. 확인 여부와 무관하게 검색
   * 화면으로는 돌아간다 — 확인창은 삭제 여부만 가른다.
   */
  async function handleDeselectPatient() {
    if (isFreshlyRegisteredPatient && selectedPatient) {
      const shouldDelete = window.confirm(
        "방금 등록한 환자 정보를 취소할까요?\n\n확인을 누르면 방금 등록한 환자 정보가 삭제됩니다.",
      );
      if (shouldDelete) {
        const res = await fetch(`/api/patients/${selectedPatient.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error ?? "환자 삭제에 실패했습니다. 정보만 해제합니다.");
        }
      }
    }
    clearSelectedPatient();
  }

  function openPatientEdit() {
    if (!selectedPatient) return;
    setEditChartNumber(selectedPatient.chartNumber);
    setEditName(selectedPatient.name);
    setPatientEditError(null);
    setPatientEditOpen(true);
  }

  async function handleSavePatientEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient) return;
    setPatientEditSaving(true);
    setPatientEditError(null);
    try {
      const res = await fetch(`/api/patients/${selectedPatient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartNumber: editChartNumber, name: editName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPatientEditError(data.error ?? "환자 정보 수정에 실패했습니다.");
        return;
      }
      setSelectedPatient(data);
      setPatientEditOpen(false);
    } finally {
      setPatientEditSaving(false);
    }
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
          // 예약여부는 접수 시점이 아니라 진료 종료 후 목록에서 별도로 체크한다 —
          // 접수 시점엔 항상 예약안함(false)으로 저장.
          isReserved: false,
          checkedByUserId: getCurrentUserId(),
          visitDate: toDateParam(selectedDate),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "내원 체크에 실패했습니다.");
        return;
      }
      setVisits((prev) => [data, ...prev]);
      clearSelectedPatient();
      setStampKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  function startEditVisit(v: VisitRecord) {
    setEditingVisitId(v.id);
    setEditVisitCategoryId(String(v.treatmentCategory.id));
    setEditVisitTypeId(String(v.visitType.id));
    setEditVisitError(null);
  }

  function cancelEditVisit() {
    setEditingVisitId(null);
    setEditVisitError(null);
  }

  async function saveEditVisit(id: number) {
    setEditVisitSaving(true);
    setEditVisitError(null);
    try {
      const res = await fetch(`/api/visits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treatmentCategoryId: Number(editVisitCategoryId),
          visitTypeId: Number(editVisitTypeId),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditVisitError(data.error ?? "수정에 실패했습니다.");
        return;
      }
      setVisits((prev) => prev.map((v) => (v.id === id ? data : v)));
      setEditingVisitId(null);
    } finally {
      setEditVisitSaving(false);
    }
  }

  async function handleToggleReserved(v: VisitRecord) {
    setTogglingReservedId(v.id);
    try {
      const res = await fetch(`/api/visits/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isReserved: !v.isReserved }),
      });
      const data = await res.json();
      if (!res.ok) return;
      setVisits((prev) => prev.map((item) => (item.id === v.id ? data : item)));
    } finally {
      setTogglingReservedId(null);
    }
  }

  async function handleDeleteVisit(id: number) {
    if (
      !window.confirm(
        "이 내원 체크 기록을 삭제하시겠습니까? (통계/목록에서 제외되며, 되돌리려면 다시 등록해야 합니다)",
      )
    ) {
      return;
    }
    await fetch(`/api/visits/${id}`, { method: "DELETE" });
    setVisits((prev) => prev.filter((v) => v.id !== id));
  }

  const isToday = isSameDate(selectedDate, startOfDay(new Date()));
  const listTitle = isToday
    ? `오늘 체크된 내원 목록 (${visits.length}건)`
    : `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 체크된 내원 목록 (${visits.length}건)`;

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>내원체크</h1>

      <div className={styles.dateNav}>
        <button
          type="button"
          className={styles.dateNavArrow}
          onClick={() => setSelectedDate((d) => addDays(d, -1))}
          aria-label="하루 전"
        >
          ◀
        </button>
        <span className={styles.dateNavLabel}>{formatFullLabel(selectedDate)}</span>
        <button
          type="button"
          className={styles.dateNavArrow}
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
          aria-label="하루 후"
        >
          ▶
        </button>
        <button
          type="button"
          className={styles.dateNavTodayButton}
          onClick={() => setSelectedDate(startOfDay(new Date()))}
        >
          오늘
        </button>
      </div>

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

            <NewPatientForm
              onCreated={(patient) => selectPatient(patient, { freshlyRegistered: true })}
            />
          </>
        )}

        {selectedPatient && !patientEditOpen && (
          <div className={styles.selectedPatient}>
            <span>
              선택된 환자: <strong>{selectedPatient.name}</strong> (
              <span className={styles.mono}>{selectedPatient.chartNumber}</span>)
            </span>
            <button type="button" onClick={openPatientEdit}>
              정보 수정
            </button>
            <button type="button" onClick={handleDeselectPatient}>
              다른 환자 선택
            </button>
          </div>
        )}

        {selectedPatient && patientEditOpen && (
          <form className={styles.row} onSubmit={handleSavePatientEdit}>
            <input
              className={styles.mono}
              type="text"
              placeholder="차트번호(숫자만)"
              value={editChartNumber}
              onChange={(e) => setEditChartNumber(e.target.value)}
            />
            <input
              type="text"
              placeholder="이름"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <button type="submit" disabled={patientEditSaving}>
              저장
            </button>
            <button type="button" onClick={() => setPatientEditOpen(false)}>
              취소
            </button>
          </form>
        )}
        {patientEditOpen && patientEditError && (
          <p className={styles.errorText}>{patientEditError}</p>
        )}
      </div>

      {selectedPatient && !patientEditOpen && (
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
        <div className={styles.sectionTitle}>{listTitle}</div>
        {visits.length === 0 ? (
          <p className={styles.muted}>체크된 내원이 없습니다.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>환자명</th>
                <th>진료분야</th>
                <th>진료구분</th>
                <th>예약여부</th>
                <th>체크한 사람</th>
                <th>메모</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <Fragment key={v.id}>
                  <tr>
                    <td>
                      <Link href={`/patients/${v.patient.id}`} className={styles.patientNameLink}>
                        {v.patient.name}
                      </Link>
                      {(activePrescByPatientId.get(v.patient.id) ?? []).map((program) => (
                        <span key={program.id} className={styles.inlineBadge}>
                          <ProgramBadge id={program.id} name={program.name} />
                        </span>
                      ))}
                    </td>
                    <td>
                      <CategoryBadge id={v.treatmentCategory.id} name={v.treatmentCategory.name} />
                    </td>
                    <td>
                      <VisitTypeTag name={v.visitType.name} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={v.isReserved ? styles.reservedButtonOn : styles.reservedButtonOff}
                        onClick={() => handleToggleReserved(v)}
                        disabled={togglingReservedId === v.id}
                      >
                        {v.isReserved ? "예약함" : "예약안함"}
                      </button>
                    </td>
                    <td>{v.checkedByUser?.name ?? "-"}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.noteToggleButton}
                        onClick={() =>
                          setExpandedNotePatientId((cur) =>
                            cur === v.patient.id ? null : v.patient.id,
                          )
                        }
                      >
                        {expandedNotePatientId === v.patient.id ? "메모 −" : "메모 +"}
                      </button>
                    </td>
                    <td>
                      <span className={styles.rowActions}>
                        <ExamButton patientId={v.patient.id} />
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() =>
                            editingVisitId === v.id ? cancelEditVisit() : startEditVisit(v)
                          }
                        >
                          {editingVisitId === v.id ? "취소" : "수정"}
                        </button>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => handleDeleteVisit(v.id)}
                        >
                          삭제
                        </button>
                      </span>
                    </td>
                  </tr>
                  {expandedNotePatientId === v.patient.id && (
                    <tr>
                      <td colSpan={7}>
                        <PatientNotes patientId={v.patient.id} />
                      </td>
                    </tr>
                  )}
                  {editingVisitId === v.id && (
                    <tr>
                      <td colSpan={7}>
                        <div className={styles.editRow}>
                          <select
                            value={editVisitCategoryId}
                            onChange={(e) => setEditVisitCategoryId(e.target.value)}
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <select
                            value={editVisitTypeId}
                            onChange={(e) => setEditVisitTypeId(e.target.value)}
                          >
                            {visitTypes.map((vt) => (
                              <option key={vt.id} value={vt.id}>
                                {vt.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={styles.editButton}
                            onClick={() => saveEditVisit(v.id)}
                            disabled={editVisitSaving}
                          >
                            저장
                          </button>
                        </div>
                        {editVisitError && <p className={styles.errorText}>{editVisitError}</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
