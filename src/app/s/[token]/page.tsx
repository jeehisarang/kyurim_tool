"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./page.module.css";
import TeachingPageContent, { type TeachingPageContentView } from "@/components/TeachingPageContent";

// TeachingPageContent.tsx와 동일한 채널(task.md) — 클라이언트 컴포넌트에서 읽어야 해서
// NEXT_PUBLIC_ 접두사가 필요하다.
const KAKAO_CHANNEL_CHAT_URL =
  process.env.NEXT_PUBLIC_KAKAO_CHANNEL_CHAT_URL ?? "https://pf.kakao.com/_FVxlGT/chat";

type ShareLinkView = {
  teaching: (TeachingPageContentView & { token: string }) | null;
  event: { finalTitle: string; compositeImagePath: string; finalCopy: string } | null;
};

/**
 * 환자별 통합 공유링크(14-11) 공개 페이지 — 프로그램티칭과 이벤트를 하나의 링크로 묶어서
 * 톡생성기에서 발송한다. teaching이 있으면 위쪽에(/p/[token]과 동일한 TeachingPageContent
 * 재사용), event가 있으면 그 아래에 표시하고, 한쪽만 있으면 그 섹션만 렌더링한다.
 */
export default function ShareLinkPublicPage() {
  const params = useParams<{ token: string }>();
  const { token } = params;

  const [view, setView] = useState<ShareLinkView | null>(null);
  const [loadError, setLoadError] = useState(false);

  // "이벤트문의하기" 버튼 상태 — TeachingPageContent의 handleCtaClick과 동일한 패턴
  // (window.open을 클릭 핸들러 내 동기적으로 먼저 호출 → cta-click 로그 + 문의 요청
  // 병렬 fetch, task.md 지시). 이벤트는 EventImage 자체가 아니라 공유링크(token) 기준으로
  // 조회되므로 여기 페이지에서 직접 상태를 들고 있는다.
  const [eventCtaClicked, setEventCtaClicked] = useState(false);
  const [eventCtaSubmitting, setEventCtaSubmitting] = useState(false);

  useEffect(() => {
    setLoadError(false);
    fetch(`/api/share-links/${token}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then(setView)
      .catch(() => setLoadError(true));
  }, [token]);

  async function handleEventCtaClick() {
    window.open(KAKAO_CHANNEL_CHAT_URL, "_blank", "noopener,noreferrer");
    setEventCtaSubmitting(true);
    try {
      await Promise.all([
        fetch(`/api/share-links/${token}/event-cta-click`, { method: "POST" }),
        fetch(`/api/share-links/${token}/event-consult-request`, { method: "POST" }),
      ]);
      setEventCtaClicked(true);
    } catch {
      // 환자용 공개 페이지라 실패해도 별도 에러 문구 없이 조용히 무시 — 버튼은 다시 누를 수 있다.
    } finally {
      setEventCtaSubmitting(false);
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
        {view.teaching && <TeachingPageContent token={view.teaching.token} view={view.teaching} />}

        {view.teaching && view.event && <hr className={styles.sectionDivider} />}

        {view.event && (
          <div>
            {view.event.finalTitle && <p className={styles.eventTitle}>{view.event.finalTitle}</p>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={view.event.compositeImagePath} alt="" className={styles.eventImage} />
            {view.event.finalCopy && <p className={styles.eventCopy}>{view.event.finalCopy}</p>}

            {eventCtaClicked ? (
              <p className={styles.ctaConfirmText}>카카오톡으로 상담 가능하십니다</p>
            ) : (
              <button
                type="button"
                className={styles.ctaButton}
                onClick={handleEventCtaClick}
                disabled={eventCtaSubmitting}
              >
                이벤트문의하기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
