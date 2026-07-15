"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./page.module.css";
import PatientViewLayout from "@/components/PatientViewLayout";
import layoutStyles from "@/components/PatientViewLayout.module.css";
import ImageZoomPan from "@/components/ImageZoomPan";
import { toPatientSafeHrvView, type PatientSafeHrvView } from "@/lib/patient-view";
import { HRV_SAFETY_NOTICE } from "@/lib/hrv-constants";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * HRV(자율신경맥파기) "환자와 함께보기" 화면(task2.md) — 원본 결과지 이미지(줌/팬 지원) +
 * AI 해설만 노출한다. 수정/삭제 등 내부용 UI는 화이트리스트 변환(toPatientSafeHrvView)이
 * 애초에 필드를 조립하지 않아 노출될 수 없다.
 */
export default function PatientViewHrvPage() {
  const params = useParams<{ id: string }>();
  const { id } = params;

  const [view, setView] = useState<PatientSafeHrvView | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);

    fetch(`/api/hrv-records/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (cancelled) return;
        const safeView = toPatientSafeHrvView(data);
        setView(safeView);

        // 과거 레코드(aiCommentary=null)는 열람 시점에 즉석 생성 후 캐싱한다(examinations와
        // 동일 원칙) — 실패해도 화면은 그대로(해설 문단만 안 보임).
        if (safeView.aiCommentary === null) {
          fetch(`/api/hrv-records/${id}/generate-commentary`, { method: "POST" })
            .then((r) => (r.ok ? r.json() : null))
            .then((result) => {
              if (!cancelled && result?.aiCommentary) {
                setView((prev) => (prev ? { ...prev, aiCommentary: result.aiCommentary } : prev));
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => setLoadError(true));

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadError) {
    return (
      <PatientViewLayout title="HRV 검사 결과">
        <p className={layoutStyles.errorText}>결과를 불러오지 못했습니다.</p>
      </PatientViewLayout>
    );
  }

  if (!view) {
    return (
      <PatientViewLayout title="HRV 검사 결과">
        <p className={layoutStyles.loadingText}>불러오는 중...</p>
      </PatientViewLayout>
    );
  }

  return (
    <PatientViewLayout title="자율신경맥파기(HRV) 검사 결과" subtitle={formatDate(view.testDate)}>
      <ImageZoomPan src={view.sourceImagePath} alt="HRV 결과지" />

      <div className={styles.metricGrid}>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>혈관건강지수</span>
          <span className={styles.metricValue}>{view.vascularHealthIndex}</span>
        </div>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>혈관건강도</span>
          <span className={styles.metricValue}>{view.vascularHealthType}</span>
        </div>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>평균맥박</span>
          <span className={styles.metricValue}>{view.avgPulse}</span>
        </div>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>스트레스지수</span>
          <span className={styles.metricValue}>{view.stressIndex}</span>
        </div>
      </div>

      {view.aiCommentary && <p className={styles.explanationBox}>{view.aiCommentary}</p>}

      {/* 5단계 "안전 안내"(task.md) — AI가 생성한 텍스트가 아니라 고정 문구를 항상 별도
          블록으로 붙인다. aiCommentary와 시각적으로 명확히 구분되게 스타일을 다르게 둔다. */}
      <div className={styles.safetyNoticeBox}>
        <div className={styles.safetyNoticeLabel}>안전 안내</div>
        <p>{HRV_SAFETY_NOTICE}</p>
      </div>
    </PatientViewLayout>
  );
}
