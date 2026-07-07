"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { getCurrentUserId } from "@/lib/currentUser";
import {
  calcSmi,
  judgeSmi,
  calcGripAvg,
  judgeGrip,
  type Gender,
  type SmiJudgement,
  type GripJudgement,
} from "@/lib/exam-thresholds";

type Patient = { id: number; chartNumber: string; name: string };
type StaffUser = { id: number; name: string; role: string };
type PrescriptionOption = {
  id: number;
  patientId: number;
  status: string;
  program: { id: number; name: string };
};

const SMI_JUDGEMENT_LABEL: Record<SmiJudgement, string> = {
  NORMAL: "정상",
  SARCOPENIA: "근감소증 의심",
};

const GRIP_JUDGEMENT_LABEL: Record<GripJudgement, string> = {
  WEAK: "약함",
  NORMAL: "정상",
  STRONG: "강함",
  UNKNOWN: "판정불가",
};

type ExamType = "BODY_COMPOSITION" | "STRENGTH_TEST";

type StrengthResult = {
  smi: number;
  smiJudgement: SmiJudgement;
  gripAvgKg: number;
  gripJudgement: GripJudgement;
};

function toNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function NewExaminationPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [staffUserId, setStaffUserId] = useState("");
  const [prescriptions, setPrescriptions] = useState<PrescriptionOption[]>([]);
  const [prescriptionId, setPrescriptionId] = useState("");

  const [examType, setExamType] = useState<ExamType | "">("");

  const [weightKg, setWeightKg] = useState("");
  const [note, setNote] = useState("");

  const [gender, setGender] = useState<Gender | "">("");
  const [measuredAge, setMeasuredAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [armMuscleMassLeftKg, setArmMuscleMassLeftKg] = useState("");
  const [armMuscleMassRightKg, setArmMuscleMassRightKg] = useState("");
  const [legMuscleMassLeftKg, setLegMuscleMassLeftKg] = useState("");
  const [legMuscleMassRightKg, setLegMuscleMassRightKg] = useState("");
  const [gripLeftKg, setGripLeftKg] = useState("");
  const [gripRightKg, setGripRightKg] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<
    | { examType: "BODY_COMPOSITION"; patientName: string; weightKg: number }
    | ({ examType: "STRENGTH_TEST"; patientName: string } & StrengthResult)
    | null
  >(null);

  useEffect(() => {
    fetch("/api/staff-users")
      .then((res) => res.json())
      .then((users: StaffUser[]) => {
        setStaffUsers(users);
        const currentUserId = getCurrentUserId();
        if (currentUserId) setStaffUserId(String(currentUserId));
      });

    fetch("/api/prescriptions")
      .then((res) => res.json())
      .then(setPrescriptions);
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

  function resetForm() {
    setSelectedPatient(null);
    setPrescriptionId("");
    setExamType("");
    setWeightKg("");
    setNote("");
    setGender("");
    setMeasuredAge("");
    setHeightCm("");
    setArmMuscleMassLeftKg("");
    setArmMuscleMassRightKg("");
    setLegMuscleMassLeftKg("");
    setLegMuscleMassRightKg("");
    setGripLeftKg("");
    setGripRightKg("");
  }

  const activePrescriptions = useMemo(
    () =>
      selectedPatient
        ? prescriptions.filter((p) => p.patientId === selectedPatient.id && p.status === "ACTIVE")
        : [],
    [prescriptions, selectedPatient],
  );

  const strengthPreview: StrengthResult | null = useMemo(() => {
    const height = toNumber(heightCm);
    const armL = toNumber(armMuscleMassLeftKg);
    const armR = toNumber(armMuscleMassRightKg);
    const legL = toNumber(legMuscleMassLeftKg);
    const legR = toNumber(legMuscleMassRightKg);
    const gripL = toNumber(gripLeftKg);
    const gripR = toNumber(gripRightKg);
    const age = toNumber(measuredAge);

    if (
      !gender ||
      height === null ||
      armL === null ||
      armR === null ||
      legL === null ||
      legR === null ||
      gripL === null ||
      gripR === null ||
      age === null
    ) {
      return null;
    }

    const smi = calcSmi({
      heightCm: height,
      armMuscleMassLeftKg: armL,
      armMuscleMassRightKg: armR,
      legMuscleMassLeftKg: legL,
      legMuscleMassRightKg: legR,
    });
    const gripAvgKg = calcGripAvg(gripL, gripR);
    return {
      smi,
      smiJudgement: judgeSmi(gender, smi),
      gripAvgKg,
      gripJudgement: judgeGrip(gender, age, gripAvgKg),
    };
  }, [
    gender,
    heightCm,
    armMuscleMassLeftKg,
    armMuscleMassRightKg,
    legMuscleMassLeftKg,
    legMuscleMassRightKg,
    gripLeftKg,
    gripRightKg,
    measuredAge,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedPatient || !staffUserId || !examType) {
      setSubmitError("환자, 검사 종류, 담당자를 모두 선택하세요.");
      return;
    }

    const commonBody = {
      patientId: selectedPatient.id,
      staffUserId: Number(staffUserId),
      prescriptionId: prescriptionId ? Number(prescriptionId) : undefined,
      examType,
    };

    let body: Record<string, unknown>;

    if (examType === "BODY_COMPOSITION") {
      const weight = toNumber(weightKg);
      if (weight === null) {
        setSubmitError("체중을 입력하세요.");
        return;
      }
      body = { ...commonBody, weightKg: weight, note: note.trim() || undefined };
    } else {
      if (!strengthPreview || !gender) {
        setSubmitError("근력검사 입력값을 모두 확인하세요.");
        return;
      }
      body = {
        ...commonBody,
        gender,
        measuredAge: toNumber(measuredAge),
        heightCm: toNumber(heightCm),
        armMuscleMassLeftKg: toNumber(armMuscleMassLeftKg),
        armMuscleMassRightKg: toNumber(armMuscleMassRightKg),
        legMuscleMassLeftKg: toNumber(legMuscleMassLeftKg),
        legMuscleMassRightKg: toNumber(legMuscleMassRightKg),
        gripLeftKg: toNumber(gripLeftKg),
        gripRightKg: toNumber(gripRightKg),
      };
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/examinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "검사 등록에 실패했습니다.");
        return;
      }

      if (examType === "BODY_COMPOSITION") {
        setLastResult({
          examType: "BODY_COMPOSITION",
          patientName: selectedPatient.name,
          weightKg: data.weightKg,
        });
      } else {
        setLastResult({
          examType: "STRENGTH_TEST",
          patientName: selectedPatient.name,
          smi: data.smi,
          smiJudgement: data.smiJudgement,
          gripAvgKg: data.gripAvgKg,
          gripJudgement: data.gripJudgement,
        });
      }
      resetForm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>검사 등록</h1>
        <Link href="/examinations" className={styles.listLink}>
          ← 검사 목록
        </Link>
      </div>

      {lastResult && (
        <div className={styles.resultBanner}>
          {lastResult.examType === "BODY_COMPOSITION" ? (
            <>
              ✅ <strong>{lastResult.patientName}</strong>님 인바디 등록 완료 —{" "}
              <span className={styles.resultValue}>{lastResult.weightKg}kg</span>
            </>
          ) : (
            <div className={styles.resultGrid}>
              <div className={styles.resultTitle}>
                ✅ <strong>{lastResult.patientName}</strong>님 근력검사 등록 완료
              </div>
              <div className={styles.resultRow}>
                <span>SMI</span>
                <span className={styles.resultValue}>{lastResult.smi.toFixed(2)} kg/m²</span>
                <span
                  className={
                    lastResult.smiJudgement === "SARCOPENIA"
                      ? styles.judgementBad
                      : styles.judgementGood
                  }
                >
                  {SMI_JUDGEMENT_LABEL[lastResult.smiJudgement]}
                </span>
              </div>
              <div className={styles.resultRow}>
                <span>악력평균</span>
                <span className={styles.resultValue}>{lastResult.gripAvgKg.toFixed(1)} kg</span>
                <span
                  className={
                    lastResult.gripJudgement === "WEAK"
                      ? styles.judgementBad
                      : styles.judgementGood
                  }
                >
                  {GRIP_JUDGEMENT_LABEL[lastResult.gripJudgement]}
                </span>
              </div>
            </div>
          )}
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
            <button type="button" onClick={resetForm}>
              다른 환자 선택
            </button>
          </div>
        )}
      </div>

      {selectedPatient && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>검사 정보</div>
          <form onSubmit={handleSubmit}>
            <div className={styles.formRow}>
              <label>
                검사 종류{" "}
                <select
                  value={examType}
                  onChange={(e) => setExamType(e.target.value as ExamType | "")}
                >
                  <option value="">선택</option>
                  <option value="BODY_COMPOSITION">인바디</option>
                  <option value="STRENGTH_TEST">근력검사</option>
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

              {activePrescriptions.length > 0 && (
                <label>
                  진행 중인 처방(선택){" "}
                  <select value={prescriptionId} onChange={(e) => setPrescriptionId(e.target.value)}>
                    <option value="">선택 안 함</option>
                    {activePrescriptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.program.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {examType === "BODY_COMPOSITION" && (
              <div className={styles.fieldGrid}>
                <label>
                  체중(kg)
                  <input
                    type="number"
                    step="0.1"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                  />
                </label>
                <label className={styles.fieldGridWide}>
                  메모(선택)
                  <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </div>
            )}

            {examType === "STRENGTH_TEST" && (
              <>
                <div className={styles.fieldGrid}>
                  <label>
                    성별
                    <select value={gender} onChange={(e) => setGender(e.target.value as Gender | "")}>
                      <option value="">선택</option>
                      <option value="MALE">남</option>
                      <option value="FEMALE">여</option>
                    </select>
                  </label>
                  <label>
                    나이(측정시점)
                    <input
                      type="number"
                      value={measuredAge}
                      onChange={(e) => setMeasuredAge(e.target.value)}
                    />
                  </label>
                  <label>
                    키(cm)
                    <input
                      type="number"
                      step="0.1"
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                    />
                  </label>
                  <label>
                    팔 골격근량(좌, kg)
                    <input
                      type="number"
                      step="0.01"
                      value={armMuscleMassLeftKg}
                      onChange={(e) => setArmMuscleMassLeftKg(e.target.value)}
                    />
                  </label>
                  <label>
                    팔 골격근량(우, kg)
                    <input
                      type="number"
                      step="0.01"
                      value={armMuscleMassRightKg}
                      onChange={(e) => setArmMuscleMassRightKg(e.target.value)}
                    />
                  </label>
                  <label>
                    다리 골격근량(좌, kg)
                    <input
                      type="number"
                      step="0.01"
                      value={legMuscleMassLeftKg}
                      onChange={(e) => setLegMuscleMassLeftKg(e.target.value)}
                    />
                  </label>
                  <label>
                    다리 골격근량(우, kg)
                    <input
                      type="number"
                      step="0.01"
                      value={legMuscleMassRightKg}
                      onChange={(e) => setLegMuscleMassRightKg(e.target.value)}
                    />
                  </label>
                  <label>
                    악력(좌, kg)
                    <input
                      type="number"
                      step="0.1"
                      value={gripLeftKg}
                      onChange={(e) => setGripLeftKg(e.target.value)}
                    />
                  </label>
                  <label>
                    악력(우, kg)
                    <input
                      type="number"
                      step="0.1"
                      value={gripRightKg}
                      onChange={(e) => setGripRightKg(e.target.value)}
                    />
                  </label>
                </div>

                <div className={styles.previewBox}>
                  <div className={styles.previewTitle}>미리보기</div>
                  {strengthPreview ? (
                    <div className={styles.resultGrid}>
                      <div className={styles.resultRow}>
                        <span>SMI</span>
                        <span className={styles.resultValue}>
                          {strengthPreview.smi.toFixed(2)} kg/m²
                        </span>
                        <span
                          className={
                            strengthPreview.smiJudgement === "SARCOPENIA"
                              ? styles.judgementBad
                              : styles.judgementGood
                          }
                        >
                          {SMI_JUDGEMENT_LABEL[strengthPreview.smiJudgement]}
                        </span>
                      </div>
                      <div className={styles.resultRow}>
                        <span>악력평균</span>
                        <span className={styles.resultValue}>
                          {strengthPreview.gripAvgKg.toFixed(1)} kg
                        </span>
                        <span
                          className={
                            strengthPreview.gripJudgement === "WEAK"
                              ? styles.judgementBad
                              : styles.judgementGood
                          }
                        >
                          {GRIP_JUDGEMENT_LABEL[strengthPreview.gripJudgement]}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className={styles.muted}>입력값을 모두 채우면 미리보기가 표시됩니다.</p>
                  )}
                </div>
              </>
            )}

            {submitError && <p className={styles.errorText}>{submitError}</p>}

            {examType && (
              <button className={styles.submitButton} type="submit" disabled={submitting}>
                검사 등록
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
