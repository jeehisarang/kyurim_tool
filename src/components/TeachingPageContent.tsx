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
 * 그대로 재사용한다(task.md 14-11 지시). 순수 콘텐츠 렌더링만 담당한다 — CTA 버튼은
 * 더 이상 이 컴포넌트가 갖지 않고(task3.md 하단 고정 CTA 통일), 각 페이지가
 * StickyBottomCta로 페이지 레벨에서 하나만 렌더링한다.
 */
export default function TeachingPageContent({ view }: { view: TeachingPageContentView }) {
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
    </>
  );
}
