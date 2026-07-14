"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./page.module.css";
import PatientViewLayout from "@/components/PatientViewLayout";
import layoutStyles from "@/components/PatientViewLayout.module.css";
import { toPatientSafeExamView, type PatientSafeExamView } from "@/lib/patient-view";

const EXAM_TYPE_TITLE: Record<string, string> = {
  BODY_COMPOSITION: "인바디 검사 결과",
  STRENGTH_TEST: "근력검사 결과",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default function PatientViewExamPage() {
  const params = useParams<{ examType: string; id: string }>();
  const { examType, id } = params;

  const [view, setView] = useState<PatientSafeExamView | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);

    fetch(`/api/examinations/${examType}/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (cancelled) return;
        const safeView = toPatientSafeExamView(data);
        setView(safeView);

        // 과거 레코드(aiExplanation=null)는 열람 시점에 즉석 생성 후 캐싱한다(task.md 지시) —
        // 실패해도 화면은 그대로(설명 문단만 안 보임), 신규 레코드 저장 실패 방지 원칙과 동일.
        if (safeView.aiExplanation === null) {
          fetch(`/api/examinations/${examType}/${id}/explain`, { method: "POST" })
            .then((r) => (r.ok ? r.json() : null))
            .then((result) => {
              if (!cancelled && result?.aiExplanation) {
                setView((prev) => (prev ? { ...prev, aiExplanation: result.aiExplanation } : prev));
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => setLoadError(true));

    return () => {
      cancelled = true;
    };
  }, [examType, id]);

  const title = EXAM_TYPE_TITLE[examType] ?? "검사 결과";

  if (loadError) {
    return (
      <PatientViewLayout title={title}>
        <p className={layoutStyles.errorText}>결과를 불러오지 못했습니다.</p>
      </PatientViewLayout>
    );
  }

  if (!view) {
    return (
      <PatientViewLayout title={title}>
        <p className={layoutStyles.loadingText}>불러오는 중...</p>
      </PatientViewLayout>
    );
  }

  return (
    <PatientViewLayout title={title} subtitle={formatDate(view.examDate)}>
      {view.examType === "BODY_COMPOSITION" ? (
        <div className={styles.resultGrid}>
          <div className={styles.resultRow}>
            <span className={styles.resultLabel}>체중</span>
            <span className={styles.resultValue}>{view.weightKg}kg</span>
          </div>
          {view.bmi != null && (
            <div className={styles.resultRow}>
              <span className={styles.resultLabel}>BMI</span>
              <span className={styles.resultValue}>{view.bmi.toFixed(1)}</span>
            </div>
          )}
          <div className={styles.resultRow}>
            <span className={styles.resultLabel}>체지방율</span>
            <span className={styles.resultValue}>{view.bodyFatPercent}%</span>
          </div>
          <div className={styles.resultRow}>
            <span className={styles.resultLabel}>WHR</span>
            <span className={styles.resultValue}>{view.whr}</span>
          </div>
          {view.smi != null && (
            <div className={styles.resultRow}>
              <span className={styles.resultLabel}>SMI (골격근량 지수)</span>
              <span className={styles.resultValue}>{view.smi.toFixed(2)}</span>
            </div>
          )}
          {view.smiPatientLabel && <div className={styles.messageBox}>{view.smiPatientLabel}</div>}
          {view.aiExplanation && <p className={styles.explanationBox}>{view.aiExplanation}</p>}
        </div>
      ) : (
        <div className={styles.resultGrid}>
          <div className={styles.resultRow}>
            <span className={styles.resultLabel}>악력 (좌 / 우)</span>
            <span className={styles.resultValue}>
              {view.gripLeftKg}kg / {view.gripRightKg}kg
            </span>
          </div>
          <div className={styles.resultRow}>
            <span className={styles.resultLabel}>악력 평균</span>
            <span className={styles.resultValue}>{view.gripAvgKg.toFixed(1)}kg</span>
          </div>
          <div className={styles.resultRow}>
            <span className={styles.resultLabel}>판정</span>
            <span className={styles.resultValue}>{view.gripJudgementLabel}</span>
          </div>
          <div className={styles.messageBox}>{view.gripAgeMessage}</div>
          {view.aiExplanation && <p className={styles.explanationBox}>{view.aiExplanation}</p>}
        </div>
      )}
    </PatientViewLayout>
  );
}
