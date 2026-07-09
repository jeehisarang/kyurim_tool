"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import SealStamp from "@/components/SealStamp";
import NewPatientForm from "@/components/NewPatientForm";
import ProgramBadge from "@/components/ProgramBadge";
import { getCurrentUserId } from "@/lib/currentUser";
import SurveyResponsePickerModal, {
  type SurveyResponseCache,
} from "@/components/SurveyResponsePickerModal";
import { formatSurveyResponseText } from "@/lib/survey-response-format";
import {
  getProgramBadgeInfo,
  getProgramCategory,
  PROGRAM_CATEGORY_GROUP_LABEL,
  PROGRAM_CATEGORY_ICON,
  PROGRAM_CATEGORY_ORDER,
} from "@/lib/program-categories";

// <option>은 HTML/굵기 표현이 안 되므로 "[아이콘] 대분류 · 기간" 형식을 평문으로 구성한다.
function programOptionLabel(program: Program): string {
  const category = getProgramCategory(program.name);
  const icon = category ? PROGRAM_CATEGORY_ICON[category] : null;
  const badgeInfo = getProgramBadgeInfo(program.name);
  const label = badgeInfo ? `${badgeInfo.family} · ${badgeInfo.period}` : program.name;
  return icon ? `${icon} ${label}` : label;
}

// 등록 폼 드롭다운은 탕약 → 환약 → 킬팻캡슐 순서를 고정한다(PROGRAM_CATEGORY_ORDER).
// 어느 카테고리에도 매핑되지 않은 프로그램(현재는 없음)은 방어적으로 마지막 "기타" 그룹에 둔다.
function groupProgramsByCategory(programs: Program[]): { label: string; programs: Program[] }[] {
  const groups = PROGRAM_CATEGORY_ORDER.map((key) => ({
    label: PROGRAM_CATEGORY_GROUP_LABEL[key],
    programs: programs.filter((p) => getProgramCategory(p.name) === key),
  }));
  const uncategorized = programs.filter((p) => getProgramCategory(p.name) === null);
  if (uncategorized.length > 0) groups.push({ label: "기타", programs: uncategorized });
  return groups.filter((g) => g.programs.length > 0);
}

type Patient = { id: number; chartNumber: string; name: string };
type Program = { id: number; name: string; type: string };
type StaffUser = { id: number; name: string; role: string };

const PROGRAM_TYPE_FIXED_SEQUENCE = "FIXED_SEQUENCE";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function toDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const TODAY_PARAM = toDateParam(new Date());

export default function NewPrescriptionPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [programId, setProgramId] = useState("");
  const [staffUserId, setStaffUserId] = useState("");
  // 처방 시작일(소급 입력 가능) — 기본값 오늘, 미래 날짜는 선택 불가.
  const [startDate, setStartDate] = useState(TODAY_PARAM);
  const [surveyDataJson, setSurveyDataJson] = useState("");
  const [surveyResponseCacheId, setSurveyResponseCacheId] = useState<number | null>(null);
  const [showSurveyPicker, setShowSurveyPicker] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stampKey, setStampKey] = useState(0);
  const [lastRegistered, setLastRegistered] = useState<{
    patientName: string;
    programId: number;
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
    setStartDate(TODAY_PARAM);
    setSurveyDataJson("");
    setSurveyResponseCacheId(null);
  }

  function handleSelectSurveyResponse(response: SurveyResponseCache) {
    setSurveyDataJson(formatSurveyResponseText(response.rawDataJson));
    setSurveyResponseCacheId(response.id);
    setShowSurveyPicker(false);
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
    if (startDate > TODAY_PARAM) {
      setSubmitError("시작일은 미래 날짜를 선택할 수 없습니다.");
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
          startDate,
          surveyDataJson: isTrialSurveyProgram ? surveyDataJson : undefined,
          surveyResponseCacheId: isTrialSurveyProgram ? surveyResponseCacheId ?? undefined : undefined,
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
        programId: selectedProgram?.id ?? 0,
        programName: selectedProgram?.name ?? "",
        startDate: data.startDate,
      });
      setProgramId("");
      setStartDate(TODAY_PARAM);
      setSurveyDataJson("");
      setSurveyResponseCacheId(null);
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
          <ProgramBadge id={lastRegistered.programId} name={lastRegistered.programName} /> (
          {formatDate(lastRegistered.startDate)} 시작)
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

            <NewPatientForm onCreated={selectPatient} />
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
                  {groupProgramsByCategory(programs).map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.programs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {programOptionLabel(p)}
                        </option>
                      ))}
                    </optgroup>
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

              <label>
                시작일{" "}
                <input
                  type="date"
                  value={startDate}
                  max={TODAY_PARAM}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
            </div>

            {isTrialSurveyProgram && (
              <label className={styles.surveyLabel}>
                <span className={styles.surveyLabelRow}>
                  설문 데이터 (수동 입력, 자유 형식)
                  <button
                    type="button"
                    className={styles.surveyImportButton}
                    onClick={() => setShowSurveyPicker(true)}
                  >
                    구글폼에서 가져오기
                  </button>
                </span>
                <textarea
                  className={styles.surveyTextarea}
                  rows={4}
                  placeholder="예: 체중 68kg, 목표 3kg 감량, 야식 자주 먹음 등 — 구글폼 응답을 보고 자유롭게 입력하세요."
                  value={surveyDataJson}
                  onChange={(e) => setSurveyDataJson(e.target.value)}
                />
              </label>
            )}

            {showSurveyPicker && (
              <SurveyResponsePickerModal
                onSelect={handleSelectSurveyResponse}
                onClose={() => setShowSurveyPicker(false)}
              />
            )}

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
