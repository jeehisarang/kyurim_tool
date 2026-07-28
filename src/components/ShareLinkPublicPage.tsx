"use client";

import { useEffect, useState } from "react";
import styles from "./ShareLinkPublicPage.module.css";
import TeachingPageContent, { type TeachingPageContentView } from "@/components/TeachingPageContent";
import ExamShareSections from "@/components/ExamShareSections";
import StickyBottomCta from "@/components/StickyBottomCta";
import type { ShareLinkExamEntry } from "@/lib/share-links";

// TeachingPageContent.tsx(리팩터 전)와 동일 채널(task3.md 하단 고정 CTA 통일).
const KAKAO_CHANNEL_CHAT_URL =
  process.env.NEXT_PUBLIC_KAKAO_CHANNEL_CHAT_URL ?? "https://pf.kakao.com/_FVxlGT/chat";

type ShareLinkView = {
  teaching: (TeachingPageContentView & { token: string }) | null;
  event: { finalTitle: string; compositeImagePath: string; finalCopy: string } | null;
  exams: ShareLinkExamEntry[];
};

/**
 * 환자별 통합 공유링크(14-11) 공개 페이지 — 프로그램티칭/이벤트/검사결과를 하나의 링크로
 * 묶어서 톡생성기에서 발송한다. 표시 순서는 항상 검사결과 → 프로그램티칭 → 이벤트로
 * 고정한다 — 포함된 조합이 무엇이든 이 순서를 그대로 적용하고, 없는 섹션은 건너뛴다.
 * 상담설문(TCM 체크리스트) 섹션은 실사용 중 발견된 문제로 완전히 제거됐다(task.md,
 * 2026-07-07 — "프로그램티칭"만 체크했는데도 자동 노출되어 환자에게 상담설문 내용이
 * 보이면 안 된다는 원장 확인). 원장 전용 화면(/consultation-survey, 검사등록 등)에서
 * 조회/입력하는 기능 자체는 그대로 유지되고, 이 공개 페이지 노출만 없앤 것.
 *
 * 하단 고정 CTA 통일(task3.md) — 기존에 섹션별로 나뉘어 있던 "프로그램문의하기"/
 * "이벤트문의하기"/"상담예약하기" 3개 버튼을 페이지 전체 기준 "진료상담문의하기" 버튼
 * 하나로 합쳤다. 콜백 업무는 requestShareLinkConsultCallback(공유링크 token 하나로 포함된
 * 섹션 전부를 판단) 한 번만 호출하고, 콘텐츠별 클릭 분석(teaching/event cta-click)은
 * 어떤 섹션이 실제로 있었는지에 따라 계속 개별 기록한다.
 */
export default function ShareLinkPublicPage({ token }: { token: string }) {
  const [view, setView] = useState<ShareLinkView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [ctaClicked, setCtaClicked] = useState(false);
  const [ctaSubmitting, setCtaSubmitting] = useState(false);

  useEffect(() => {
    setLoadError(false);
    fetch(`/api/share-links/${token}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then(setView)
      .catch(() => setLoadError(true));
  }, [token]);

  async function handleCtaClick() {
    window.open(KAKAO_CHANNEL_CHAT_URL, "_blank", "noopener,noreferrer");
    setCtaSubmitting(true);
    try {
      const clickLogRequests: Promise<Response>[] = [];
      if (view?.teaching) {
        clickLogRequests.push(fetch(`/api/teaching-pages/${view.teaching.token}/cta-click`, { method: "POST" }));
      }
      if (view?.event) {
        clickLogRequests.push(fetch(`/api/share-links/${token}/event-cta-click`, { method: "POST" }));
      }
      await Promise.all([
        ...clickLogRequests,
        fetch(`/api/share-links/${token}/consult-request`, { method: "POST" }),
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

  const hasExams = view.exams.length > 0;
  const hasTeaching = view.teaching !== null;
  const hasEvent = view.event !== null;

  return (
    <>
      <div className={styles.page}>
        <div className={styles.card}>
          {hasExams && <ExamShareSections exams={view.exams} />}
          {hasExams && (hasTeaching || hasEvent) && <hr className={styles.sectionDivider} />}

          {view.teaching && <TeachingPageContent view={view.teaching} />}
          {hasTeaching && hasEvent && <hr className={styles.sectionDivider} />}

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
      <StickyBottomCta clicked={ctaClicked} submitting={ctaSubmitting} onClick={handleCtaClick} />
    </>
  );
}
