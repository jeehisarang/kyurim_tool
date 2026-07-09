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
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
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
