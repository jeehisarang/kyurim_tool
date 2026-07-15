"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import NewPatientForm from "@/components/NewPatientForm";
import HrvImportModal, { type HrvDriveFile } from "@/components/HrvImportModal";
import { getCurrentUserId } from "@/lib/currentUser";
import {
  computeSmi,
  computeBmi,
  judgeSmi,
  calcGripAvg,
  judgeGrip,
  computeGripAge,
  computeGripAgeTrend,
  GRIP_AGE_OUT_OF_RANGE_LABEL,
  type Gender,
  type SmiJudgement,
  type GripJudgement,
  type GripAgeOutOfRange,
  type GripAgeTrend,
} from "@/lib/exam-thresholds";

type Patient = {
  id: number;
  chartNumber: string;
  name: string;
  height: number | null;
  gender: Gender | null;
};
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

const GRIP_AGE_TREND_LABEL: Record<GripAgeTrend, string> = {
  IMPROVED: "개선 ↓",
  MAINTAINED: "유지 →",
  WORSENED: "악화 ↑",
};

type ExamType = "BODY_COMPOSITION" | "STRENGTH_TEST" | "HRV";

type GripAgeResult = { estimatedAge: number | null; outOfRange: GripAgeOutOfRange | null };

type StrengthResult = {
  gripAvgKg: number;
  gripJudgement: GripJudgement;
} & GripAgeResult;

function formatGripAge(result: GripAgeResult): string {
  if (result.outOfRange) return GRIP_AGE_OUT_OF_RANGE_LABEL[result.outOfRange];
  return `${result.estimatedAge}세`;
}

type BodyPreview = {
  bmi: number | null;
  smi: number | null;
  smiJudgement: SmiJudgement | null;
};

function toNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const TODAY_PARAM = toDateParam(new Date());

export default function NewExaminationPage() {
  return (
    <Suspense fallback={null}>
      <NewExaminationPageInner />
    </Suspense>
  );
}

function NewExaminationPageInner() {
  const searchParams = useSearchParams();
  const prefillPatientId = searchParams.get("patientId");
  // /examinations/[examType]/[id] 상세보기의 "같은 환자 다른 검사종류 추가 등록" 버튼에서
  // examDate/examType까지 함께 넘겨주면 그대로 이어서 채워 넣는다.
  const prefillExamDateParam = searchParams.get("examDate");
  const prefillExamTypeParam = searchParams.get("examType");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(false);

  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [staffUserId, setStaffUserId] = useState("");
  const [prescriptions, setPrescriptions] = useState<PrescriptionOption[]>([]);
  const [prescriptionId, setPrescriptionId] = useState("");

  const [examType, setExamType] = useState<ExamType | "">(
    prefillExamTypeParam === "BODY_COMPOSITION" || prefillExamTypeParam === "STRENGTH_TEST"
      ? prefillExamTypeParam
      : "",
  );
  // 검사 실시일(소급 입력 가능) — 기본값 오늘, 미래 날짜는 선택 불가.
  const [examDate, setExamDate] = useState(prefillExamDateParam ?? TODAY_PARAM);

  // 인바디(BODY_COMPOSITION) 입력
  const [weightKg, setWeightKg] = useState("");
  const [bodyFatPercent, setBodyFatPercent] = useState("");
  const [whr, setWhr] = useState("");
  const [note, setNote] = useState("");
  // 키는 인바디에서만 쓰는 Patient 고정값. 성별은 인바디/근력검사 양쪽이 공유하는
  // Patient 고정값이라 examType과 무관하게 하나의 state로 관리한다.
  const [bodyHeightCm, setBodyHeightCm] = useState("");
  const [patientGender, setPatientGender] = useState<Gender | "">("");
  const [showLimbSection, setShowLimbSection] = useState(false);
  const [rightArmKg, setRightArmKg] = useState("");
  const [leftArmKg, setLeftArmKg] = useState("");
  const [rightLegKg, setRightLegKg] = useState("");
  const [leftLegKg, setLeftLegKg] = useState("");

  // 근력검사(STRENGTH_TEST) 입력 — 순수 악력만 다룬다(SMI/사지골격근량/키는 인바디 전용).
  const [measuredAge, setMeasuredAge] = useState("");
  const [gripLeftKg, setGripLeftKg] = useState("");
  const [gripRightKg, setGripRightKg] = useState("");

  // 근력나이 추이(개선/유지/악화) 표시용 — 환자의 가장 최근 근력검사 기록.
  const [previousGripAge, setPreviousGripAge] = useState<GripAgeResult | null>(null);

  // HRV(자율신경맥파기) 입력 — 기기가 이미 판정까지 끝낸 결과지 이미지 + 핵심 수치 4개만
  // 옮겨 적는다(task2.md). 이미지는 구글드라이브 가져오기 또는 직접 파일 선택 둘 다 지원.
  const [hrvImageFile, setHrvImageFile] = useState<File | null>(null);
  const [hrvDriveFileId, setHrvDriveFileId] = useState<string | null>(null);
  const [hrvImagePreviewUrl, setHrvImagePreviewUrl] = useState<string | null>(null);
  const [showHrvImportModal, setShowHrvImportModal] = useState(false);
  const [vascularHealthIndex, setVascularHealthIndex] = useState("");
  const [vascularHealthType, setVascularHealthType] = useState("");
  const [avgPulse, setAvgPulse] = useState("");
  const [stressIndex, setStressIndex] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<
    | { examType: "BODY_COMPOSITION"; patientId: number; patientName: string; weightKg: number }
    | ({ examType: "STRENGTH_TEST"; patientId: number; patientName: string } & StrengthResult)
    | { examType: "HRV"; patientId: number; patientName: string; hrvRecordId: number; vascularHealthIndex: number }
    | null
  >(null);
  const [patientViewPopupBlocked, setPatientViewPopupBlocked] = useState(false);

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

  // /visit-check, /prescriptions 환자 리스트의 "검사" 버튼에서 ?patientId=로 진입한 경우
  // 환자 재검색 없이 바로 폼으로 채워 넣는다.
  useEffect(() => {
    if (!prefillPatientId) return;
    setPrefillLoading(true);
    fetch(`/api/patients/${prefillPatientId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((patient: Patient | null) => {
        if (patient) selectPatient(patient);
      })
      .finally(() => setPrefillLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillPatientId]);

  // 근력나이 추이 표시용 — 환자 선택 시 가장 최근 근력검사 기록을 미리 불러온다.
  useEffect(() => {
    if (!selectedPatient) {
      setPreviousGripAge(null);
      return;
    }
    fetch(`/api/examinations?patientId=${selectedPatient.id}`)
      .then((res) => res.json())
      .then(
        (
          rows: Array<{
            examType: string;
            estimatedGripAge?: number | null;
            gripAgeOutOfRange?: GripAgeOutOfRange | null;
          }>,
        ) => {
          // listExaminations는 이미 examDate 내림차순 정렬 — 첫 STRENGTH_TEST가 가장 최근.
          const latest = rows.find((r) => r.examType === "STRENGTH_TEST");
          setPreviousGripAge(
            latest
              ? { estimatedAge: latest.estimatedGripAge ?? null, outOfRange: latest.gripAgeOutOfRange ?? null }
              : null,
          );
        },
      );
  }, [selectedPatient]);

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
    setBodyHeightCm(patient.height != null ? String(patient.height) : "");
    setPatientGender(patient.gender ?? "");
  }

  function resetForm() {
    setSelectedPatient(null);
    setPrescriptionId("");
    setExamType("");
    setWeightKg("");
    setBodyFatPercent("");
    setWhr("");
    setNote("");
    setBodyHeightCm("");
    setPatientGender("");
    setShowLimbSection(false);
    setRightArmKg("");
    setLeftArmKg("");
    setRightLegKg("");
    setLeftLegKg("");
    setMeasuredAge("");
    setGripLeftKg("");
    setGripRightKg("");
    setExamDate(TODAY_PARAM);
    setHrvImageFile(null);
    setHrvDriveFileId(null);
    setHrvImagePreviewUrl(null);
    setVascularHealthIndex("");
    setVascularHealthType("");
    setAvgPulse("");
    setStressIndex("");
  }

  function handleHrvFileSelect(file: File | null) {
    setHrvImageFile(file);
    setHrvDriveFileId(null);
    setHrvImagePreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  function handleHrvDriveSelect(file: HrvDriveFile) {
    setHrvImageFile(null);
    setHrvDriveFileId(file.id);
    setHrvImagePreviewUrl(file.thumbnailLink);
    setShowHrvImportModal(false);
    if (file.matchedPatient) {
      selectPatient({ ...file.matchedPatient, height: null, gender: null });
    }
  }

  const activePrescriptions = useMemo(
    () =>
      selectedPatient
        ? prescriptions.filter((p) => p.patientId === selectedPatient.id && p.status === "ACTIVE")
        : [],
    [prescriptions, selectedPatient],
  );

  const bodyPreview: BodyPreview = useMemo(() => {
    const weight = toNumber(weightKg);
    const height = toNumber(bodyHeightCm);
    const bmi = weight !== null && height !== null ? computeBmi(weight, height) : null;

    const rA = toNumber(rightArmKg);
    const lA = toNumber(leftArmKg);
    const rL = toNumber(rightLegKg);
    const lL = toNumber(leftLegKg);

    let smi: number | null = null;
    let smiJudgement: SmiJudgement | null = null;
    if (showLimbSection && height !== null && rA !== null && lA !== null && rL !== null && lL !== null) {
      const result = computeSmi(height, rA, lA, rL, lL);
      smi = result.smi;
      if (patientGender) smiJudgement = judgeSmi(patientGender, smi);
    }

    return { bmi, smi, smiJudgement };
  }, [weightKg, bodyHeightCm, showLimbSection, rightArmKg, leftArmKg, rightLegKg, leftLegKg, patientGender]);

  const strengthPreview: StrengthResult | null = useMemo(() => {
    const gripL = toNumber(gripLeftKg);
    const gripR = toNumber(gripRightKg);
    const age = toNumber(measuredAge);

    if (!patientGender || gripL === null || gripR === null || age === null) {
      return null;
    }

    const gripAvgKg = calcGripAvg(gripL, gripR);
    const gripAge = computeGripAge(patientGender, gripAvgKg);
    return {
      gripAvgKg,
      gripJudgement: judgeGrip(patientGender, age, gripAvgKg),
      estimatedAge: gripAge.estimatedAge,
      outOfRange: gripAge.outOfRange,
    };
  }, [patientGender, gripLeftKg, gripRightKg, measuredAge]);

  const gripAgeTrend: GripAgeTrend | null =
    strengthPreview && previousGripAge
      ? computeGripAgeTrend(strengthPreview, previousGripAge)
      : null;

  async function handleHrvSubmit() {
    if (!selectedPatient || !staffUserId) return;

    const index = toNumber(vascularHealthIndex);
    const pulse = toNumber(avgPulse);
    const stress = toNumber(stressIndex);
    if (index === null || !vascularHealthType.trim() || pulse === null || stress === null) {
      setSubmitError("혈관건강지수/혈관건강도/평균맥박/스트레스지수를 모두 입력하세요.");
      return;
    }
    if (!hrvImageFile && !hrvDriveFileId) {
      setSubmitError("결과지 이미지를 선택하거나 구글드라이브에서 가져오세요.");
      return;
    }

    const formData = new FormData();
    formData.set("patientId", String(selectedPatient.id));
    formData.set("staffUserId", staffUserId);
    formData.set("testDate", examDate);
    formData.set("vascularHealthIndex", String(index));
    formData.set("vascularHealthType", vascularHealthType.trim());
    formData.set("avgPulse", String(pulse));
    formData.set("stressIndex", String(stress));
    if (hrvImageFile) formData.set("image", hrvImageFile);
    if (hrvDriveFileId) formData.set("driveFileId", hrvDriveFileId);

    setSubmitting(true);
    try {
      const res = await fetch("/api/hrv-records", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "HRV 검사 등록에 실패했습니다.");
        return;
      }
      setLastResult({
        examType: "HRV",
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        hrvRecordId: data.id,
        vascularHealthIndex: data.vascularHealthIndex,
      });
      setPatientViewPopupBlocked(false);
      resetForm();
    } catch {
      setSubmitError("서버에 연결하지 못했습니다. 검사 기록이 저장되지 않았으니 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedPatient || !staffUserId || !examType) {
      setSubmitError("환자, 검사 종류, 담당자를 모두 선택하세요.");
      return;
    }
    if (examDate > TODAY_PARAM) {
      setSubmitError("검사일자는 미래 날짜를 선택할 수 없습니다.");
      return;
    }

    if (examType === "HRV") {
      await handleHrvSubmit();
      return;
    }

    const commonBody = {
      patientId: selectedPatient.id,
      staffUserId: Number(staffUserId),
      prescriptionId: prescriptionId ? Number(prescriptionId) : undefined,
      examType,
      examDate,
    };

    let body: Record<string, unknown>;

    if (examType === "BODY_COMPOSITION") {
      const weight = toNumber(weightKg);
      const bodyFat = toNumber(bodyFatPercent);
      const whrValue = toNumber(whr);
      if (weight === null || bodyFat === null || whrValue === null) {
        setSubmitError("체중, 체지방율, WHR을 모두 입력하세요.");
        return;
      }

      const height = toNumber(bodyHeightCm);
      if (selectedPatient.height == null && height === null) {
        setSubmitError("환자의 키(cm)를 입력하세요.");
        return;
      }
      if (selectedPatient.gender == null && !patientGender) {
        setSubmitError("환자의 성별을 선택하세요.");
        return;
      }

      let limbFields: Record<string, unknown> = {};
      if (showLimbSection) {
        const rA = toNumber(rightArmKg);
        const lA = toNumber(leftArmKg);
        const rL = toNumber(rightLegKg);
        const lL = toNumber(leftLegKg);
        if (rA === null || lA === null || rL === null || lL === null) {
          setSubmitError("사지골격근량 4개 항목을 모두 입력하거나, 체크를 해제하세요.");
          return;
        }
        limbFields = {
          armMuscleMassRightKg: rA,
          armMuscleMassLeftKg: lA,
          legMuscleMassRightKg: rL,
          legMuscleMassLeftKg: lL,
        };
      }

      body = {
        ...commonBody,
        weightKg: weight,
        bodyFatPercent: bodyFat,
        whr: whrValue,
        heightCm: height ?? undefined,
        gender: patientGender || undefined,
        ...limbFields,
        note: note.trim() || undefined,
      };
    } else {
      if (selectedPatient.gender == null && !patientGender) {
        setSubmitError("환자의 성별을 선택하세요.");
        return;
      }
      if (!strengthPreview) {
        setSubmitError("근력검사 입력값을 모두 확인하세요.");
        return;
      }
      body = {
        ...commonBody,
        gender: patientGender || undefined,
        measuredAge: toNumber(measuredAge),
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
          patientId: selectedPatient.id,
          patientName: selectedPatient.name,
          weightKg: data.weightKg,
        });
      } else {
        setLastResult({
          examType: "STRENGTH_TEST",
          patientId: selectedPatient.id,
          patientName: selectedPatient.name,
          gripAvgKg: data.gripAvgKg,
          gripJudgement: data.gripJudgement,
          estimatedAge: data.estimatedGripAge,
          outOfRange: data.gripAgeOutOfRange,
        });
      }
      setPatientViewPopupBlocked(false);
      resetForm();
    } catch {
      setSubmitError("서버에 연결하지 못했습니다. 검사 기록이 저장되지 않았으니 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  // 등록 완료 즉시 1클릭으로 종합 리포트를 열 수 있게 한다(기존 등록→목록→상세→버튼
  // 클릭의 3단계를 제거, task.md 핵심 요청사항).
  function handleOpenPatientView() {
    if (!lastResult) return;
    setPatientViewPopupBlocked(false);
    const url =
      lastResult.examType === "HRV"
        ? `/patient-view/exam/hrv/${lastResult.hrvRecordId}`
        : `/patient-view/exam-report/${lastResult.patientId}`;
    const win = window.open(url, "_blank", "noopener,noreferrer,width=760,height=900");
    if (!win || win.closed) {
      setPatientViewPopupBlocked(true);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.titleGroup}>
          <BackButton />
          <h1 className={styles.pageTitle}>검사 등록</h1>
        </div>
        <Link href="/examinations" className={styles.listLink}>
          ← 검사 목록
        </Link>
      </div>

      {lastResult && (
        <div className={styles.resultBanner}>
          {lastResult.examType === "BODY_COMPOSITION" && (
            <>
              ✅ <strong>{lastResult.patientName}</strong>님 인바디 등록 완료 —{" "}
              <span className={styles.resultValue}>{lastResult.weightKg}kg</span>
            </>
          )}
          {lastResult.examType === "STRENGTH_TEST" && (
            <div className={styles.resultGrid}>
              <div className={styles.resultTitle}>
                ✅ <strong>{lastResult.patientName}</strong>님 근력검사 등록 완료
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
              <div className={styles.resultRow}>
                <span>근력나이</span>
                <span className={styles.resultValue}>{formatGripAge(lastResult)}</span>
              </div>
            </div>
          )}
          {lastResult.examType === "HRV" && (
            <>
              ✅ <strong>{lastResult.patientName}</strong>님 HRV 검사 등록 완료 —{" "}
              <span className={styles.resultValue}>혈관건강지수 {lastResult.vascularHealthIndex}</span>
            </>
          )}
          <div>
            <button
              type="button"
              className={styles.patientViewButton}
              onClick={handleOpenPatientView}
            >
              환자와 함께보기
            </button>
          </div>
          {patientViewPopupBlocked && (
            <p className={styles.errorText}>
              팝업이 차단되었습니다. 브라우저 주소창의 팝업 차단 아이콘을 눌러 이 사이트의 팝업을
              허용한 뒤 다시 시도해주세요.
            </p>
          )}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>환자 검색</div>

        {!selectedPatient && (
          <>
            {prefillLoading && <p className={styles.muted}>환자 정보를 불러오는 중...</p>}
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

            <NewPatientForm
              onCreated={(patient) => selectPatient({ ...patient, height: null, gender: null })}
            />
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
                  <option value="HRV">자율신경맥파기(HRV)</option>
                </select>
              </label>

              <label>
                검사일자{" "}
                <input
                  type="date"
                  value={examDate}
                  max={TODAY_PARAM}
                  onChange={(e) => setExamDate(e.target.value)}
                />
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
              <>
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
                  <label>
                    체지방율(%)
                    <input
                      type="number"
                      step="0.1"
                      value={bodyFatPercent}
                      onChange={(e) => setBodyFatPercent(e.target.value)}
                    />
                  </label>
                  <label>
                    WHR(복부지방율)
                    <input type="number" step="0.01" value={whr} onChange={(e) => setWhr(e.target.value)} />
                  </label>
                  <label>
                    키(cm){selectedPatient.height != null && <span className={styles.muted}> — 저장된 값</span>}
                    <input
                      type="number"
                      step="0.1"
                      value={bodyHeightCm}
                      onChange={(e) => setBodyHeightCm(e.target.value)}
                    />
                  </label>
                  <label>
                    성별{selectedPatient.gender != null && <span className={styles.muted}> — 저장된 값</span>}
                    <select
                      value={patientGender}
                      onChange={(e) => setPatientGender(e.target.value as Gender | "")}
                    >
                      <option value="">선택</option>
                      <option value="MALE">남</option>
                      <option value="FEMALE">여</option>
                    </select>
                  </label>
                  <label className={styles.fieldGridWide}>
                    메모(선택)
                    <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
                  </label>
                </div>

                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={showLimbSection}
                    onChange={(e) => setShowLimbSection(e.target.checked)}
                  />
                  사지골격근량 측정하셨나요?
                </label>

                {showLimbSection && (
                  <div className={styles.fieldGrid}>
                    <label>
                      팔 골격근량(우, kg)
                      <input
                        type="number"
                        step="0.01"
                        value={rightArmKg}
                        onChange={(e) => setRightArmKg(e.target.value)}
                      />
                    </label>
                    <label>
                      팔 골격근량(좌, kg)
                      <input
                        type="number"
                        step="0.01"
                        value={leftArmKg}
                        onChange={(e) => setLeftArmKg(e.target.value)}
                      />
                    </label>
                    <label>
                      다리 골격근량(우, kg)
                      <input
                        type="number"
                        step="0.01"
                        value={rightLegKg}
                        onChange={(e) => setRightLegKg(e.target.value)}
                      />
                    </label>
                    <label>
                      다리 골격근량(좌, kg)
                      <input
                        type="number"
                        step="0.01"
                        value={leftLegKg}
                        onChange={(e) => setLeftLegKg(e.target.value)}
                      />
                    </label>
                  </div>
                )}

                <div className={styles.previewBox}>
                  <div className={styles.previewTitle}>미리보기</div>
                  <div className={styles.resultGrid}>
                    <div className={styles.resultRow}>
                      <span>BMI</span>
                      {bodyPreview.bmi !== null ? (
                        <span className={styles.resultValue}>{bodyPreview.bmi.toFixed(1)}</span>
                      ) : (
                        <span className={styles.muted}>체중/키를 입력하면 표시됩니다.</span>
                      )}
                    </div>
                    {showLimbSection && (
                      <div className={styles.resultRow}>
                        <span>SMI</span>
                        {bodyPreview.smi !== null ? (
                          <>
                            <span className={styles.resultValue}>{bodyPreview.smi.toFixed(2)} kg/m²</span>
                            {bodyPreview.smiJudgement && (
                              <span
                                className={
                                  bodyPreview.smiJudgement === "SARCOPENIA"
                                    ? styles.judgementBad
                                    : styles.judgementGood
                                }
                              >
                                {SMI_JUDGEMENT_LABEL[bodyPreview.smiJudgement]}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className={styles.muted}>사지골격근량 4개를 모두 입력하면 표시됩니다.</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {examType === "STRENGTH_TEST" && (
              <>
                <div className={styles.fieldGrid}>
                  <label>
                    성별{selectedPatient.gender != null && <span className={styles.muted}> — 저장된 값</span>}
                    <select
                      value={patientGender}
                      onChange={(e) => setPatientGender(e.target.value as Gender | "")}
                    >
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
                      <div className={styles.resultRow}>
                        <span>근력나이</span>
                        <span className={styles.resultValue}>{formatGripAge(strengthPreview)}</span>
                        {gripAgeTrend && (
                          <span
                            className={
                              gripAgeTrend === "WORSENED" ? styles.judgementBad : styles.judgementGood
                            }
                          >
                            {GRIP_AGE_TREND_LABEL[gripAgeTrend]}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className={styles.muted}>입력값을 모두 채우면 미리보기가 표시됩니다.</p>
                  )}
                </div>
              </>
            )}

            {examType === "HRV" && (
              <>
                <div className={styles.checkboxRow}>
                  <button
                    type="button"
                    className={styles.submitButton}
                    onClick={() => setShowHrvImportModal(true)}
                  >
                    구글드라이브에서 가져오기
                  </button>
                  <label>
                    또는 직접 파일 선택{" "}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => handleHrvFileSelect(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>

                {hrvImagePreviewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={hrvImagePreviewUrl} alt="HRV 결과지 미리보기" className={styles.hrvPreviewImage} />
                )}

                <div className={styles.fieldGrid}>
                  <label>
                    혈관건강지수
                    <input
                      type="number"
                      step="0.1"
                      value={vascularHealthIndex}
                      onChange={(e) => setVascularHealthIndex(e.target.value)}
                    />
                  </label>
                  <label>
                    혈관건강도
                    <input
                      type="text"
                      placeholder="예: 양호"
                      value={vascularHealthType}
                      onChange={(e) => setVascularHealthType(e.target.value)}
                    />
                  </label>
                  <label>
                    평균맥박
                    <input
                      type="number"
                      step="0.1"
                      value={avgPulse}
                      onChange={(e) => setAvgPulse(e.target.value)}
                    />
                  </label>
                  <label>
                    스트레스지수
                    <input
                      type="number"
                      step="0.1"
                      value={stressIndex}
                      onChange={(e) => setStressIndex(e.target.value)}
                    />
                  </label>
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

      {showHrvImportModal && (
        <HrvImportModal onSelect={handleHrvDriveSelect} onClose={() => setShowHrvImportModal(false)} />
      )}
    </div>
  );
}
