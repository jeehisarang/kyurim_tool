"use client";

import styles from "./PatientViewLayout.module.css";

/**
 * "환자와 함께보기" 계열 화면(/patient-view/*) 공용 레이아웃 — 사이드바/내비게이션 없이
 * 화면 가운데 큰 카드 하나만 띄운다. 이번 검사 상세에 이어 향후 환자통합프로필
 * (/patient-view/profile/[patientId])도 동일 컴포넌트를 그대로 재사용할 수 있게
 * 화이트리스트 변환 로직(lib/patient-view.ts)과 완전히 분리해뒀다.
 */
export default function PatientViewLayout({
  title,
  subtitle,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  // 결과지 이미지처럼 폭이 필요한 화면 전용(task.md 3번 — 카드 기본 640px가 리포트
  // 이미지엔 너무 좁아 글씨가 안 보인다는 실사용 피드백). 텍스트 위주 화면은 기존 640px
  // 유지가 가독성에 더 낫기 때문에 기본값은 false로 두고 opt-in한다.
  wide?: boolean;
}) {
  return (
    <div className={styles.page}>
      <div className={`${styles.card} ${wide ? styles.cardWide : ""}`}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
        <div className={styles.footerRow}>
          <button type="button" className={styles.closeButton} onClick={() => window.close()}>
            직원화면으로 돌아가기 / 닫기
          </button>
        </div>
      </div>
    </div>
  );
}
