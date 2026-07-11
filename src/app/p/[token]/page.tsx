"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./page.module.css";

type TeachingPageView = {
  programName: string;
  supportImagePath: string | null;
  headline: string;
  personalSubtopic: string;
  bodyText: string;
  examSummary: string | null;
  academicHook: string;
  testValueSummary: string | null;
  viewCount: number;
  ctaButtonLabel: string;
};

/**
 * 환자 티칭지(14-2, 프로그램 중심) 공개 페이지 — 인증 없음, 사이드바 없는 독립 모바일
 * 우선 레이아웃. getPublicTeachingPageByToken이 이미 화이트리스트 변환을 마친 안전한
 * 필드만 내려주므로 여기서는 받은 대로 그대로 렌더링만 한다.
 */
export default function TeachingPagePublicPage() {
  const params = useParams<{ token: string }>();
  const { token } = params;

  const [view, setView] = useState<TeachingPageView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [ctaClicked, setCtaClicked] = useState(false);
  const [ctaSubmitting, setCtaSubmitting] = useState(false);

  useEffect(() => {
    setLoadError(false);
    fetch(`/api/teaching-pages/${token}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then(setView)
      .catch(() => setLoadError(true));
  }, [token]);

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

  if (loadError) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.errorText}>페이지를 찾을 수 없습니다.</p>
        </div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.loadingText}>불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
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
      </div>
    </div>
  );
}
