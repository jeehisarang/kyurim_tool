"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./page.module.css";
import TeachingPageContent, { type TeachingPageContentView } from "@/components/TeachingPageContent";

/**
 * 환자 티칭지(14-2, 프로그램 중심) 공개 페이지 — 인증 없음, 사이드바 없는 독립 모바일
 * 우선 레이아웃. getPublicTeachingPageByToken이 이미 화이트리스트 변환을 마친 안전한
 * 필드만 내려주므로 여기서는 받은 대로 그대로 렌더링만 한다. 실제 5필드 렌더링은
 * /s/[token](통합 공유링크)과 공유하는 TeachingPageContent가 담당한다.
 */
export default function TeachingPagePublicPage() {
  const params = useParams<{ token: string }>();
  const { token } = params;

  const [view, setView] = useState<TeachingPageContentView | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
    fetch(`/api/teaching-pages/${token}`)
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
        <TeachingPageContent token={token} view={view} />
      </div>
    </div>
  );
}
