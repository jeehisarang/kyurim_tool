"use client";

import type { ReactNode } from "react";
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

// AI가 **로 감싸 표시한 핵심 문장/패턴명(hrv-explanation.ts 프롬프트, task2.md "안 C")을
// <strong>으로 변환한다. dangerouslySetInnerHTML 대신 텍스트를 분해해 React 노드로 조립하므로
// AI 응답에 HTML이 섞여도 그대로 이스케이프되어 안전하다.
function renderWithEmphasis(text: string, emphasisClassName: string): ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className={emphasisClassName}>
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

/**
 * HRV AI 코멘트 4단 구조 읽기 전용 표시(task.md 4번) — ProgramTeachingCreator의 섹션별
 * 카드 패턴을 따른다. 원장 확인 화면(편집 가능)과 "환자와 함께보기"(읽기 전용) 둘 다
 * 이 컴포넌트로 동일하게 보여주고, 각 화면은 필요하면 이 위에 편집 UI만 별도로 얹는다.
 * 섹션 필드가 전부 비어있는 과거 레코드는 legacyText(구 단일문단)로 폴백 표시한다.
 *
 * variant="patient"일 때만 강조 문구를 굵게+확대 표시한다(task2.md — 원장 확인화면에는
 * 이번 가독성 개선이 전파되면 안 되므로, 기본값 "staff"는 굵게만 적용하고 크기는 그대로 둔다.
 * **마커 자체는 항상 파싱한다 — 안 하면 원장 화면에 별표가 그대로 노출되는 회귀가 생긴다).
 */
export default function HrvCommentaryCards({
  sections,
  legacyText,
  variant = "staff",
}: {
  sections: HrvCommentaryFields;
  legacyText?: string | null;
  variant?: "staff" | "patient";
}) {
  const hasSections = SECTION_LABELS.some(({ key }) => sections[key]);
  const emphasisClassName = variant === "patient" ? styles.emphasisPatient : styles.emphasisStaff;

  if (!hasSections) {
    if (!legacyText) return null;
    return (
      <div className={styles.legacyBlock}>
        <p>{renderWithEmphasis(legacyText, emphasisClassName)}</p>
      </div>
    );
  }

  return (
    <div className={variant === "patient" ? styles.cardListPatient : styles.cardList}>
      {SECTION_LABELS.map(({ key, label }) =>
        sections[key] ? (
          <div key={key} className={variant === "patient" ? styles.cardPatient : styles.card}>
            <div className={variant === "patient" ? styles.cardLabelPatient : styles.cardLabel}>{label}</div>
            <p className={variant === "patient" ? styles.cardBodyPatient : styles.cardBody}>
              {renderWithEmphasis(sections[key], emphasisClassName)}
            </p>
          </div>
        ) : null,
      )}
    </div>
  );
}
