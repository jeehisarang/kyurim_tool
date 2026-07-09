"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";
import { computeBmi, GRIP_AGE_OUT_OF_RANGE_LABEL, type Gender, type GripAgeOutOfRange } from "@/lib/exam-thresholds";

type PatientInfo = { id: number; name: string; chartNumber: string; height: number | null; gender: Gender | null };
type StaffInfo = { id: number; name: string };
type PrescriptionInfo = { id: number; program: { id: number; name: string } } | null;

type BodyDetail = {
  examType: "BODY_COMPOSITION";
  id: number;
  patient: PatientInfo;
  prescriptionId: number | null;
  prescription: PrescriptionInfo;
  examDate: string;
  weightKg: number;
  bodyFatPercent: number;
  whr: number;
  armMuscleMassLeftKg: number | null;
  armMuscleMassRightKg: number | null;
  legMuscleMassLeftKg: number | null;
  legMuscleMassRightKg: number | null;
  smi: number | null;
  smiJudgement: "NORMAL" | "SARCOPENIA" | null;
  note: string | null;
  staffUser: StaffInfo;
};

type StrengthDetail = {
  examType: "STRENGTH_TEST";
  id: number;
  patient: PatientInfo;
  prescriptionId: number | null;
  prescription: PrescriptionInfo;
  examDate: string;
  measuredAge: number;
  gripLeftKg: number;
  gripRightKg: number;
  gripAvgKg: number;
  gripJudgement: "WEAK" | "NORMAL" | "STRONG" | "UNKNOWN";
  estimatedGripAge: number | null;
  gripAgeOutOfRange: GripAgeOutOfRange | null;
  staffUser: StaffInfo;
};

type Detail = BodyDetail | StrengthDetail;

const SMI_JUDGEMENT_LABEL: Record<string, string> = { NORMAL: "정상", SARCOPENIA: "근감소증 의심" };
const GRIP_JUDGEMENT_LABEL: Record<string, string> = {
  WEAK: "약함",
  NORMAL: "정상",
  STRONG: "강함",
  UNKNOWN: "판정불가",
};
const EXAM_TYPE_LABEL: Record<string, string> = { BODY_COMPOSITION: "인바디", STRENGTH_TEST: "근력검사" };

function toNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function formatGripAge(estimatedAge: number | null, outOfRange: GripAgeOutOfRange | null): string {
  if (outOfRange) return GRIP_AGE_OUT_OF_RANGE_LABEL[outOfRange];
  return `${estimatedAge}세`;
}

export default function ExaminationDetailPage() {
  const params = useParams<{ examType: string; id: string }>();
  const router = useRouter();
  const { examType, id } = params;

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [patientViewPopupBlocked, setPatientViewPopupBlocked] = useState(false);

  // 인바디 수정 입력값
  const [examDate, setExamDate] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [bodyFatPercent, setBodyFatPercent] = useState("");
  const [whr, setWhr] = useState("");
  const [note, setNote] = useState("");
  const [showLimbSection, setShowLimbSection] = useState(false);
  const [armLeftKg, setArmLeftKg] = useState("");
  const [armRightKg, setArmRightKg] = useState("");
  const [legLeftKg, setLegLeftKg] = useState("");
  const [legRightKg, setLegRightKg] = useState("");

  // 근력검사 수정 입력값
  const [measuredAge, setMeasuredAge] = useState("");
  const [gripLeftKg, setGripLeftKg] = useState("");
  const [gripRightKg, setGripRightKg] = useState("");

  function loadDetail() {
    fetch(`/api/examinations/${examType}/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: Detail) => setDetail(data))
      .catch(() => setLoadError("검사기록을 불러오지 못했습니다."));
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examType, id]);

  function startEdit() {
    if (!detail) return;
    setSaveError(null);
    setExamDate(toDateInputValue(detail.examDate));
    if (detail.examType === "BODY_COMPOSITION") {
      setWeightKg(String(detail.weightKg));
      setBodyFatPercent(String(detail.bodyFatPercent));
      setWhr(String(detail.whr));
      setNote(detail.note ?? "");
      const hasLimbs = detail.armMuscleMassLeftKg != null;
      setShowLimbSection(hasLimbs);
      setArmLeftKg(detail.armMuscleMassLeftKg != null ? String(detail.armMuscleMassLeftKg) : "");
      setArmRightKg(detail.armMuscleMassRightKg != null ? String(detail.armMuscleMassRightKg) : "");
      setLegLeftKg(detail.legMuscleMassLeftKg != null ? String(detail.legMuscleMassLeftKg) : "");
      setLegRightKg(detail.legMuscleMassRightKg != null ? String(detail.legMuscleMassRightKg) : "");
    } else {
      setMeasuredAge(String(detail.measuredAge));
      setGripLeftKg(String(detail.gripLeftKg));
      setGripRightKg(String(detail.gripRightKg));
    }
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setSaveError(null);

    let body: Record<string, unknown>;

    if (detail.examType === "BODY_COMPOSITION") {
      const weight = toNumber(weightKg);
      const bodyFat = toNumber(bodyFatPercent);
      const whrValue = toNumber(whr);
      if (weight === null || bodyFat === null || whrValue === null) {
        setSaveError("체중, 체지방율, WHR을 모두 입력하세요.");
        return;
      }
      let limbFields: Record<string, unknown> = {};
      if (showLimbSection) {
        const rA = toNumber(armRightKg);
        const lA = toNumber(armLeftKg);
        const rL = toNumber(legRightKg);
        const lL = toNumber(legLeftKg);
        if (rA === null || lA === null || rL === null || lL === null) {
          setSaveError("사지골격근량 4개 항목을 모두 입력하거나, 체크를 해제하세요.");
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
        examDate,
        weightKg: weight,
        bodyFatPercent: bodyFat,
        whr: whrValue,
        note: note.trim() || undefined,
        ...limbFields,
      };
    } else {
      const age = toNumber(measuredAge);
      const gripL = toNumber(gripLeftKg);
      const gripR = toNumber(gripRightKg);
      if (age === null || gripL === null || gripR === null) {
        setSaveError("근력검사 입력값을 모두 확인하세요.");
        return;
      }
      body = { examDate, measuredAge: age, gripLeftKg: gripL, gripRightKg: gripR };
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/examinations/${examType}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "수정에 실패했습니다.");
        return;
      }
      setEditing(false);
      loadDetail();
    } finally {
      setSaving(false);
    }
  }

  function handleOpenPatientView() {
    setPatientViewPopupBlocked(false);
    const win = window.open(
      `/patient-view/exam/${examType}/${id}`,
      "_blank",
      "noopener,noreferrer,width=720,height=900",
    );
    // 브라우저 팝업 차단 시 window.open이 null을 반환하거나, 반환은 되지만 즉시
    // closed 상태인 창을 주는 경우가 있어 둘 다 확인한다.
    if (!win || win.closed) {
      setPatientViewPopupBlocked(true);
    }
  }

  async function handleDelete() {
    if (!window.confirm("이 검사기록을 삭제하시겠습니까? 삭제 후에는 되돌릴 수 없습니다.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/examinations/${examType}/${id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("삭제에 실패했습니다.");
        return;
      }
      router.push("/examinations");
    } finally {
      setDeleting(false);
    }
  }

  if (loadError) {
    return (
      <div className={styles.container}>
        <p className={styles.errorText}>{loadError}</p>
        <Link href="/examinations" className={styles.listLink}>
          ← 검사 목록
        </Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={styles.container}>
        <p className={styles.muted}>불러오는 중...</p>
      </div>
    );
  }

  const otherExamType = detail.examType === "BODY_COMPOSITION" ? "STRENGTH_TEST" : "BODY_COMPOSITION";
  const otherExamLabel = EXAM_TYPE_LABEL[otherExamType];
  const addOtherParams = new URLSearchParams({
    patientId: String(detail.patient.id),
    examDate: toDateInputValue(detail.examDate),
    examType: otherExamType,
  });

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>
          {EXAM_TYPE_LABEL[detail.examType]} 상세 — {detail.patient.name}
        </h1>
        <Link href="/examinations" className={styles.listLink}>
          ← 검사 목록
        </Link>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>환자 정보</div>
        <p>
          <strong>{detail.patient.name}</strong>{" "}
          <span className={styles.mono}>({detail.patient.chartNumber})</span>
        </p>
        <p className={styles.muted}>측정일: {formatDate(detail.examDate)} · 측정자: {detail.staffUser.name}</p>
        {detail.prescription && (
          <p className={styles.muted}>연결된 처방: {detail.prescription.program.name}</p>
        )}
      </div>

      {!editing && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>검사 결과</div>

          {detail.examType === "BODY_COMPOSITION" ? (
            <div className={styles.resultGrid}>
              <div className={styles.resultRow}>
                <span>체중</span>
                <span className={styles.resultValue}>{detail.weightKg}kg</span>
              </div>
              {detail.patient.height != null && (
                <div className={styles.resultRow}>
                  <span>BMI</span>
                  <span className={styles.resultValue}>
                    {computeBmi(detail.weightKg, detail.patient.height).toFixed(1)}
                  </span>
                </div>
              )}
              <div className={styles.resultRow}>
                <span>체지방율</span>
                <span className={styles.resultValue}>{detail.bodyFatPercent}%</span>
              </div>
              <div className={styles.resultRow}>
                <span>WHR</span>
                <span className={styles.resultValue}>{detail.whr}</span>
              </div>
              {detail.smi != null ? (
                <div className={styles.resultRow}>
                  <span>SMI</span>
                  <span className={styles.resultValue}>{detail.smi.toFixed(2)} kg/m²</span>
                  {detail.smiJudgement && (
                    <span className={detail.smiJudgement === "SARCOPENIA" ? styles.judgementBad : undefined}>
                      {SMI_JUDGEMENT_LABEL[detail.smiJudgement]}
                    </span>
                  )}
                </div>
              ) : (
                <p className={styles.muted}>사지골격근량 미측정 — SMI 계산 안 됨</p>
              )}
              {detail.note && <p className={styles.muted}>메모: {detail.note}</p>}
            </div>
          ) : (
            <div className={styles.resultGrid}>
              <div className={styles.resultRow}>
                <span>나이(측정시점)</span>
                <span className={styles.resultValue}>{detail.measuredAge}세</span>
              </div>
              <div className={styles.resultRow}>
                <span>악력(좌/우)</span>
                <span className={styles.resultValue}>
                  {detail.gripLeftKg}kg / {detail.gripRightKg}kg
                </span>
              </div>
              <div className={styles.resultRow}>
                <span>악력평균</span>
                <span className={styles.resultValue}>{detail.gripAvgKg.toFixed(1)}kg</span>
                <span className={detail.gripJudgement === "WEAK" ? styles.judgementBad : undefined}>
                  {GRIP_JUDGEMENT_LABEL[detail.gripJudgement]}
                </span>
              </div>
              <div className={styles.resultRow}>
                <span>근력나이</span>
                <span className={styles.resultValue}>
                  {formatGripAge(detail.estimatedGripAge, detail.gripAgeOutOfRange)}
                </span>
              </div>
            </div>
          )}

          <div className={styles.actionRow}>
            <button type="button" className={styles.editButton} onClick={startEdit}>
              수정
            </button>
            <button
              type="button"
              className={styles.deleteButton}
              onClick={handleDelete}
              disabled={deleting}
            >
              삭제
            </button>
            <Link href={`/examinations/new?${addOtherParams.toString()}`} className={styles.addOtherButton}>
              + 같은 환자 {otherExamLabel} 추가 등록
            </Link>
            <button type="button" className={styles.patientViewButton} onClick={handleOpenPatientView}>
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

      {editing && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>검사 결과 수정</div>
          <form onSubmit={handleSave}>
            <div className={styles.fieldGrid}>
              <label>
                검사일자
                <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
              </label>
            </div>

            {detail.examType === "BODY_COMPOSITION" ? (
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
                    WHR
                    <input type="number" step="0.01" value={whr} onChange={(e) => setWhr(e.target.value)} />
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
                        value={armRightKg}
                        onChange={(e) => setArmRightKg(e.target.value)}
                      />
                    </label>
                    <label>
                      팔 골격근량(좌, kg)
                      <input
                        type="number"
                        step="0.01"
                        value={armLeftKg}
                        onChange={(e) => setArmLeftKg(e.target.value)}
                      />
                    </label>
                    <label>
                      다리 골격근량(우, kg)
                      <input
                        type="number"
                        step="0.01"
                        value={legRightKg}
                        onChange={(e) => setLegRightKg(e.target.value)}
                      />
                    </label>
                    <label>
                      다리 골격근량(좌, kg)
                      <input
                        type="number"
                        step="0.01"
                        value={legLeftKg}
                        onChange={(e) => setLegLeftKg(e.target.value)}
                      />
                    </label>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.fieldGrid}>
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
            )}

            {saveError && <p className={styles.errorText}>{saveError}</p>}

            <div className={styles.actionRow}>
              <button className={styles.submitButton} type="submit" disabled={saving}>
                저장
              </button>
              <button type="button" className={styles.editButton} onClick={() => setEditing(false)}>
                취소
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
