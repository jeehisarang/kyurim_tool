"use client";

import { useState } from "react";
import styles from "./TeachingPageContent.module.css";

export type TeachingPageContentView = {
  programName: string;
  supportImagePath: string | null;
  headline: string;
  personalSubtopic: string;
  bodyText: string;
  examSummary: string | null;
  academicHook: string;
  testValueSummary: string | null;
  ctaButtonLabel: string;
};

/**
 * 티칭지 5필드(headline → personalSubtopic → bodyText → examSummary(있을 때만) →
 * academicHook) 렌더링 — /p/[token](단독 링크)과 /s/[token](통합 공유링크) 양쪽이
 * 그대로 재사용한다(task.md 14-11 지시). CTA 클릭 로그는 원래 티칭지 token 기준으로
 * 남기므로, 어느 경로로 봤든 같은 POST /api/teaching-pages/{token}/cta-click을 호출한다.
 */
export default function TeachingPageContent({
  token,
  view,
}: {
  token: string;
  view: TeachingPageContentView;
}) {
  const [ctaClicked, setCtaClicked] = useState(false);
  const [ctaSubmitting, setCtaSubmitting] = useState(false);

  // 중복 클릭 방지는 하지 않는다(task.md 지시) — 다시 눌러도 그대로 각각 로그가 남는다.
  async function handleCtaClick() {
    setCtaSubmitting(true);
    try {
      await fetch(`/api/teaching-pages/${token}/cta-click`, { method: "POST" });
      setCtaClicked(true);
    } catch {
      // 환자용 공개 페이지라 실패해도 별도 에러 문구 없이 조용히 무시 — 버튼은 다시 누를 수 있다.
    } finally {
      setCtaSubmitting(false);
    }
  }

  return (
    <>
      <p className={styles.headline}>{view.headline}</p>
      <p className={styles.personalSubtopic}>{view.personalSubtopic}</p>
      <p className={styles.bodyText}>{view.bodyText}</p>
      {view.examSummary && <p className={styles.examSummary}>{view.examSummary}</p>}
      <p className={styles.academicHook}>{view.academicHook}</p>

      {view.testValueSummary && (
        <div className={styles.testValueBox}>
          <div className={styles.testValueLabel}>검사수치</div>
          <p>{view.testValueSummary}</p>
        </div>
      )}

      {view.supportImagePath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={view.supportImagePath} alt="" className={styles.image} />
      )}

      <button
        type="button"
        className={styles.ctaButton}
        onClick={handleCtaClick}
        disabled={ctaSubmitting}
      >
        {view.ctaButtonLabel}
      </button>
      {ctaClicked && <p className={styles.ctaConfirmText}>신청이 접수되었습니다. 곧 연락드리겠습니다.</p>}
    </>
  );
}
