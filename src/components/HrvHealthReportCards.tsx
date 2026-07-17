"use client";

import type { ReactNode } from "react";
import styles from "./HrvHealthReportCards.module.css";
import type { HealthReportCards } from "@/lib/patient-view";

// AI가 **로 감싸 표시한 핵심 문장/패턴명을 <strong>으로 변환한다(HrvCommentaryCards.tsx와
// 동일한 로직 — CSS 모듈이 페이지/컴포넌트별로 복제되는 기존 관례를 그대로 따라 여기도
// 소규모 유틸을 별도 공유 모듈로 빼지 않고 둔다). dangerouslySetInnerHTML 없이 텍스트를
// React 노드로 분해하므로 AI 응답에 HTML이 섞여도 그대로 이스케이프되어 안전하다.
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
 * "건강 리포트" 7카드 매거진 스타일(task.md 리뉴얼) — HrvCommentaryCards(구 4섹션 나열식)를
 * commentaryVersion="HEALTH_REPORT_V1" 레코드에서 대체한다. 과거 레코드는 계속 기존
 * HrvCommentaryCards로 렌더링되므로(회귀 방지) 이 컴포넌트는 건드리지 않는다.
 * 카드2(내가 선택한 증상)/카드3(주목할 변화)/카드6(위험신호)은 데이터가 없으면(예: 첫 검사라
 * 비교 대상이 없거나 상담설문 응답이 없는 경우) 카드 자체를 숨긴다.
 */
export default function HrvHealthReportCards({
  cards,
  variant = "staff",
}: {
  cards: HealthReportCards;
  variant?: "staff" | "patient";
}) {
  const isPatient = variant === "patient";
  const listClass = isPatient ? styles.cardListPatient : styles.cardList;
  const cardClass = isPatient ? styles.cardPatient : styles.card;
  const labelClass = isPatient ? styles.cardLabelPatient : styles.cardLabel;
  const bodyClass = isPatient ? styles.cardBodyPatient : styles.cardBody;
  const emphasisClass = isPatient ? styles.emphasisPatient : styles.emphasisStaff;

  return (
    <div className={listClass}>
      {/* 카드1: 헤드라인 */}
      <div className={isPatient ? styles.heroCardPatient : styles.heroCard}>
        <p className={isPatient ? styles.heroBodyPatient : styles.heroBody}>
          {renderWithEmphasis(cards.headline, emphasisClass)}
        </p>
      </div>

      {/* 카드2: 내가 선택한 증상 */}
      {cards.checkedSymptoms.length > 0 && (
        <div className={cardClass}>
          <div className={labelClass}>내가 선택한 증상</div>
          <ul className={isPatient ? styles.symptomListPatient : styles.symptomList}>
            {cards.checkedSymptoms.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 카드3: 이번 검사에서 주목할 변화 */}
      {cards.notableChanges.length > 0 && (
        <div className={cardClass}>
          <div className={labelClass}>이번 검사에서 주목할 변화</div>
          <ul className={styles.changeList}>
            {cards.notableChanges.map((c, i) => (
              <li key={i} className={c.direction === "IMPROVED" ? styles.changeImproved : styles.changeAttention}>
                {c.sentence}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 카드4: 한의 건강해석 */}
      <div className={cardClass}>
        <div className={labelClass}>한의 건강해석</div>
        <p className={bodyClass}>{renderWithEmphasis(cards.tcmInterpretation, emphasisClass)}</p>
      </div>

      {/* 카드5: 이런 경향이 지속되면 */}
      <div className={cardClass}>
        <div className={labelClass}>이런 경향이 지속되면</div>
        <p className={bodyClass}>{renderWithEmphasis(cards.progression, emphasisClass)}</p>
      </div>

      {/* 카드6: 위험신호 안내 (redFlagNotice 없으면 카드 자체를 숨김) */}
      {cards.redFlagNotice && (
        <div className={styles.redFlagCard}>
          <div className={styles.redFlagLabel}>⚠ 위험신호 안내</div>
          <p className={styles.redFlagBody}>{cards.redFlagNotice}</p>
        </div>
      )}

      {/* 카드7: 치료 방향 + 생활관리 */}
      <div className={cardClass}>
        <div className={labelClass}>치료 방향 &amp; 생활관리</div>
        <p className={bodyClass}>{renderWithEmphasis(cards.treatmentAndLifestyle, emphasisClass)}</p>
      </div>
    </div>
  );
}
