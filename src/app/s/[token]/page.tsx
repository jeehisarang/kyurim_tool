"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./page.module.css";
import TeachingPageContent, { type TeachingPageContentView } from "@/components/TeachingPageContent";

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

  useEffect(() => {
    setLoadError(false);
    fetch(`/api/share-links/${token}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then(setView)
      .catch(() => setLoadError(true));
  }, [token]);

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
          </div>
        )}
      </div>
    </div>
  );
}
