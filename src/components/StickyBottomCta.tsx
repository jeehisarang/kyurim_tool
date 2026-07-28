"use client";

import styles from "./StickyBottomCta.module.css";

const CTA_LABEL = "진료상담문의하기";

/**
 * 환자 대면 페이지 하단 고정 CTA(task3.md) — /p/[token], /s/[token] 공통. 스크롤은
 * 본문만 되고 이 바는 항상 화면 하단에 고정된다. 기존에 페이지/섹션별로 나뉘어 있던
 * "프로그램문의하기"/"이벤트문의하기"/"상담예약하기" 버튼을 이 하나로 통일했다 —
 * 환자에게 보이는 문구는 어느 페이지든 항상 "진료상담문의하기" 하나뿐이다.
 */
export default function StickyBottomCta({
  clicked,
  submitting,
  onClick,
}: {
  clicked: boolean;
  submitting: boolean;
  onClick: () => void;
}) {
  return (
    <div className={styles.bar}>
      <div className={styles.inner}>
        {clicked ? (
          <p className={styles.confirmText}>카카오톡으로 상담 가능하십니다</p>
        ) : (
          <button type="button" className={styles.button} onClick={onClick} disabled={submitting}>
            {CTA_LABEL}
          </button>
        )}
      </div>
    </div>
  );
}
