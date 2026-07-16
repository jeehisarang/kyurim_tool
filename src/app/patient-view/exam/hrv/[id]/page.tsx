"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./page.module.css";
import PatientViewLayout from "@/components/PatientViewLayout";
import layoutStyles from "@/components/PatientViewLayout.module.css";
import ImageZoomPan from "@/components/ImageZoomPan";
import HrvCommentaryCards from "@/components/HrvCommentaryCards";
import { toPatientSafeHrvView, type PatientSafeHrvView, type PatientSafeHrvSections } from "@/lib/patient-view";
import { HRV_SAFETY_NOTICE } from "@/lib/hrv-constants";
import type { HrvSeverity } from "@/lib/hrv-thresholds";

// 진입 시 자동 1단계 확대(task.md 3번) — ImageZoomPan 내부 ZOOM_STEP(0.4)만큼 미리 확대된
// 값과 맞춰, "+" 버튼을 한 번 더 누른 것과 동일한 배율로 시작한다.
const AUTO_ZOOM_SCALE = 1.4;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 정상/경계/위험 severity → CSS 클래스(task2.md 색상 매핑 원칙: 정상=녹색/경계=주황/위험=빨강).
// vascularHealthTypeSeverity처럼 null(판정불가)일 수도 있는 경우 기본색(강조 없음)으로 둔다.
function severityClass(styles: Record<string, string>, severity: HrvSeverity | null): string {
  if (severity === "NORMAL") return styles.metricValueNormal;
  if (severity === "CAUTION") return styles.metricValueCaution;
  if (severity === "DANGER") return styles.metricValueDanger;
  return "";
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

        // 과거 레코드(섹션/레거시 코멘트 둘 다 없음)는 열람 시점에 즉석 생성 후 캐싱한다
        // (examinations와 동일 원칙) — 실패해도 화면은 그대로(해설 카드만 안 보임).
        if (safeView.sections === null && safeView.legacyCommentary === null) {
          fetch(`/api/hrv-records/${id}/generate-commentary`, { method: "POST" })
            .then((r) => (r.ok ? r.json() : null))
            .then((result: { sections: PatientSafeHrvSections | null } | null) => {
              if (!cancelled && result?.sections) {
                setView((prev) => (prev ? { ...prev, sections: result.sections } : prev));
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
    <PatientViewLayout title="자율신경맥파기(HRV) 검사 결과" subtitle={formatDate(view.testDate)} wide>
      {/* 결과지 2장(1p 요약/2p 상세)을 세로로 나열 — 별도 탭 전환 없이 스크롤만으로 둘 다
          보이는 가장 단순한 방식(task.md 1번). 2페이지가 없는 과거 레코드는 1장만 보인다. */}
      <div className={styles.imageStack}>
        <ImageZoomPan src={view.sourceImagePath} alt="HRV 결과지 1페이지" initialScale={AUTO_ZOOM_SCALE} />
        {view.sourceImagePath2 && (
          <ImageZoomPan src={view.sourceImagePath2} alt="HRV 결과지 2페이지" initialScale={AUTO_ZOOM_SCALE} />
        )}
      </div>

      <div className={styles.metricGrid}>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>혈관건강지수</span>
          <span className={`${styles.metricValue} ${severityClass(styles, view.vascularHealthIndexSeverity)}`}>
            {view.vascularHealthIndex}
          </span>
        </div>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>혈관건강도</span>
          <span className={`${styles.metricValue} ${severityClass(styles, view.vascularHealthTypeSeverity)}`}>
            {view.vascularHealthType}
          </span>
        </div>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>평균맥박</span>
          <span className={`${styles.metricValue} ${severityClass(styles, view.avgPulseSeverity)}`}>
            {view.avgPulse}
          </span>
        </div>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>스트레스지수</span>
          <span className={`${styles.metricValue} ${severityClass(styles, view.stressIndexSeverity)}`}>
            {view.stressIndex}
          </span>
        </div>
      </div>

      <HrvCommentaryCards
        sections={view.sections ?? { deviceReading: null, clinicalMeaning: null, lifestyleGuide: null, tcmInterpretation: null }}
        legacyText={view.legacyCommentary}
        variant="patient"
        commentaryVersion={view.commentaryVersion}
      />

      {/* 5단계 "안전 안내"(task.md) — AI가 생성한 텍스트가 아니라 고정 문구를 항상 별도
          블록으로 붙인다. aiCommentary와 시각적으로 명확히 구분되게 스타일을 다르게 둔다.
          경고색 배경/테두리는 기존 그대로 유지하고 글자 크기/줄간격만 키운다(task2.md). */}
      <div className={styles.safetyNoticeBox}>
        <div className={styles.safetyNoticeLabel}>안전 안내</div>
        <p>{HRV_SAFETY_NOTICE}</p>
      </div>
    </PatientViewLayout>
  );
}
