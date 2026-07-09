"use client";

import { useState } from "react";
import styles from "./NewPatientForm.module.css";

type Patient = { id: number; chartNumber: string; name: string };

/**
 * /visit-check, /prescriptions/new, /examinations/new에서 공유하는 신규 환자 등록 폼.
 * Patient만 생성하고 Visit은 만들지 않는다 — 호출한 화면에서 그대로 이어서 등록 진행.
 */
export default function NewPatientForm({
  onCreated,
}: {
  onCreated: (patient: Patient) => void;
}) {
  const [open, setOpen] = useState(false);
  const [chartNumber, setChartNumber] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicatePatient, setDuplicatePatient] = useState<Patient | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setOpen(false);
    setChartNumber("");
    setName("");
    setError(null);
    setDuplicatePatient(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDuplicatePatient(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartNumber, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.existingPatient) {
          setDuplicatePatient(data.existingPatient);
          return;
        }
        setError(data.error ?? "환자 등록에 실패했습니다.");
        return;
      }
      onCreated(data);
      reset();
    } finally {
      setSubmitting(false);
    }
  }

  function useDuplicate() {
    if (!duplicatePatient) return;
    onCreated(duplicatePatient);
    reset();
  }

  if (!open) {
    return (
      <button type="button" className={styles.openButton} onClick={() => setOpen(true)}>
        + 신규 환자 등록
      </button>
    );
  }

  return (
    <div className={styles.container}>
      {!duplicatePatient && (
        <form className={styles.row} onSubmit={handleSubmit}>
          <input
            className={styles.mono}
            type="text"
            placeholder="차트번호(숫자만)"
            value={chartNumber}
            onChange={(e) => setChartNumber(e.target.value)}
          />
          <input
            type="text"
            placeholder="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={submitting}>
            등록
          </button>
          <button type="button" onClick={reset}>
            취소
          </button>
        </form>
      )}
      {error && <p className={styles.errorText}>{error}</p>}
      {duplicatePatient && (
        <div className={styles.duplicateNotice}>
          <p>
            이미 등록된 환자입니다: <strong>{duplicatePatient.name}</strong> (
            <span className={styles.mono}>{duplicatePatient.chartNumber}</span>)
          </p>
          <div className={styles.duplicateActions}>
            <button
              type="button"
              className={styles.duplicateProceedButton}
              onClick={useDuplicate}
            >
              이 환자로 진행
            </button>
            <button
              type="button"
              className={styles.duplicateRetryButton}
              onClick={() => setDuplicatePatient(null)}
            >
              다시 입력
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
