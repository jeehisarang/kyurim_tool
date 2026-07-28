"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./page.module.css";
import TeachingPageContent, { type TeachingPageContentView } from "@/components/TeachingPageContent";
import StickyBottomCta from "@/components/StickyBottomCta";

// TeachingPageContent.tsx(리팩터 전)와 동일 채널(task3.md 하단 고정 CTA 통일).
const KAKAO_CHANNEL_CHAT_URL =
  process.env.NEXT_PUBLIC_KAKAO_CHANNEL_CHAT_URL ?? "https://pf.kakao.com/_FVxlGT/chat";

/**
 * 환자 티칭지(14-2, 프로그램 중심) 공개 페이지 — 인증 없음, 사이드바 없는 독립 모바일
 * 우선 레이아웃. getPublicTeachingPageByToken이 이미 화이트리스트 변환을 마친 안전한
 * 필드만 내려주므로 여기서는 받은 대로 그대로 렌더링만 한다. 실제 5필드 렌더링은
 * /s/[token](통합 공유링크)과 공유하는 TeachingPageContent가 담당하고, 하단 고정
 * CTA(진료상담문의하기, task3.md)는 이 페이지가 직접 소유한다.
 */
export default function TeachingPagePublicPage() {
  const params = useParams<{ token: string }>();
  const { token } = params;

  const [view, setView] = useState<TeachingPageContentView | null>(null);
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

  // window.open은 반드시 클릭 핸들러 안에서 동기적으로 먼저 호출해야 팝업 차단을 피할 수
  // 있어, fetch 완료를 기다리지 않고 바로 새 탭을 연다(기존 TeachingPageContent 로직 그대로).
  async function handleCtaClick() {
    window.open(KAKAO_CHANNEL_CHAT_URL, "_blank", "noopener,noreferrer");
    setCtaSubmitting(true);
    try {
      await Promise.all([
        fetch(`/api/teaching-pages/${token}/cta-click`, { method: "POST" }),
        fetch(`/api/teaching-pages/${token}/consult-request`, { method: "POST" }),
      ]);
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
    <>
      <div className={styles.page}>
        <div className={styles.card}>
          <TeachingPageContent view={view} />
        </div>
      </div>
      <StickyBottomCta clicked={ctaClicked} submitting={ctaSubmitting} onClick={handleCtaClick} />
    </>
  );
}
