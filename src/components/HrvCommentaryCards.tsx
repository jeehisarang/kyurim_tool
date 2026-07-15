"use client";

import styles from "./HrvCommentaryCards.module.css";

const SECTION_LABELS = [
  { key: "deviceReading", label: "기기 판독 요약" },
  { key: "clinicalMeaning", label: "임상적 의미" },
  { key: "lifestyleGuide", label: "생활관리 안내" },
  { key: "tcmInterpretation", label: "한의학적 해석" },
] as const;

export type HrvCommentaryFields = {
  deviceReading: string | null;
  clinicalMeaning: string | null;
  lifestyleGuide: string | null;
  tcmInterpretation: string | null;
};

/**
 * HRV AI 코멘트 4단 구조 읽기 전용 표시(task.md 4번) — ProgramTeachingCreator의 섹션별
 * 카드 패턴을 따른다. 원장 확인 화면(편집 가능)과 "환자와 함께보기"(읽기 전용) 둘 다
 * 이 컴포넌트로 동일하게 보여주고, 각 화면은 필요하면 이 위에 편집 UI만 별도로 얹는다.
 * 섹션 필드가 전부 비어있는 과거 레코드는 legacyText(구 단일문단)로 폴백 표시한다.
 */
export default function HrvCommentaryCards({
  sections,
  legacyText,
}: {
  sections: HrvCommentaryFields;
  legacyText?: string | null;
}) {
  const hasSections = SECTION_LABELS.some(({ key }) => sections[key]);

  if (!hasSections) {
    if (!legacyText) return null;
    return (
      <div className={styles.legacyBlock}>
        <p>{legacyText}</p>
      </div>
    );
  }

  return (
    <div className={styles.cardList}>
      {SECTION_LABELS.map(({ key, label }) =>
        sections[key] ? (
          <div key={key} className={styles.card}>
            <div className={styles.cardLabel}>{label}</div>
            <p className={styles.cardBody}>{sections[key]}</p>
          </div>
        ) : null,
      )}
    </div>
  );
}
