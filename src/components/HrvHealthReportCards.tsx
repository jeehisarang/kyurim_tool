"use client";

import type { ReactNode } from "react";
import { PieChart, Pie, Cell } from "recharts";
import styles from "./HrvHealthReportCards.module.css";
import type { HealthReportCards, CategoryVisualizationView } from "@/lib/patient-view";
import { tcmCategoryColor, tcmCategoryIcon, TCM_CATEGORY_NEUTRAL_COLOR, TCM_LIFESTYLE_ICON } from "@/lib/tcm-category-visuals";

// 카드4 도넛 데이터 — 후보 카테고리 슬라이스만(task.md — "기타" 조각 완전 제거, 후보
// 카테고리끼리만 재정규화해 도넛이 후보만으로 꽉 찬다).
function donutData(visualization: CategoryVisualizationView): { name: string; value: number; color: string }[] {
  return visualization.slices.map((s) => ({
    name: s.categoryLabel,
    value: s.ratioPercent,
    color: tcmCategoryColor(s.categoryCode),
  }));
}

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

// 카드7 치료방향 카드 전용(task.md) — renderWithEmphasis와 달리 "**키워드**(한자)" 조합을
// 하나로 인식해서 키워드는 볼드, 뒤따르는 괄호 한자는 작게+회색으로 스타일링한다. 한자
// 병기가 없는 순수 **볼드**만 있는 구간(예: 한자 사전에 없는 키워드)은 기존과 동일하게
// 볼드만 적용된다.
function renderTreatmentBody(text: string, emphasisClassName: string, hanjaClassName: string): ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*(\([^)]*\))?/g);
  const nodes: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) nodes.push(parts[i]);
    if (parts[i + 1] !== undefined) {
      nodes.push(
        <strong key={`b${i}`} className={emphasisClassName}>
          {parts[i + 1]}
        </strong>,
      );
      if (parts[i + 2]) {
        nodes.push(
          <span key={`h${i}`} className={hanjaClassName}>
            {parts[i + 2]}
          </span>,
        );
      }
    }
  }
  return nodes;
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

      {/* 카드4: 한의 건강해석 — 상단에 카테고리 비중 시각화, 도넛(좌)+막대(우) 조합
          (task.md). 후보 카테고리끼리만 원점수 합으로 재정규화해 100%를 채운다("기타"
          조각/범례 없음 — 체크리스트 전체 만점 대비 방식은 후보 수 적을 때 "기타"가
          과도해져 폐기). 두 시각화 모두 tcm-category-visuals.ts의 고정 색상(카드7과 동일)을
          쓴다. 후보 카테고리가 없으면(slices 빈 배열) 시각화 자체를 숨긴다. */}
      <div className={cardClass}>
        <div className={labelClass}>한의 건강해석</div>
        {cards.categoryVisualization.slices.length > 0 && (
          <div className={isPatient ? styles.visualWrapPatient : styles.visualWrap}>
            <div className={styles.donutWrap}>
              <PieChart width={96} height={96}>
                <Pie
                  data={donutData(cards.categoryVisualization)}
                  dataKey="value"
                  innerRadius={26}
                  outerRadius={46}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  {donutData(cards.categoryVisualization).map((slice, i) => (
                    <Cell key={i} fill={slice.color} />
                  ))}
                </Pie>
              </PieChart>
            </div>
            <div className={styles.shareBarList}>
              {cards.categoryVisualization.slices.map((s, i) => (
                <div key={i} className={styles.shareBarRow}>
                  <span className={styles.shareBarDot} style={{ background: tcmCategoryColor(s.categoryCode) }} />
                  <span className={styles.shareBarLabel}>{s.categoryLabel}</span>
                  <div className={styles.shareBarTrack}>
                    <div className={styles.shareBarFill} style={{ width: `${s.ratioPercent}%`, background: tcmCategoryColor(s.categoryCode) }} />
                  </div>
                  <span className={styles.shareBarPercent}>{s.ratioPercent}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
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

      {/* 카드7 카드형 재구성(task.md) — 카테고리별 치료방향 카드(전부 펼쳐진 상태로 노출,
          아코디언 아님) + 마지막 공통 생활관리 카드 1개. 카테고리별 카드는 카테고리마다
          완전히 독립된 AI 호출 결과라 다른 카테고리 내용이 섞이지 않는다(AI 개인화 버전으로
          롤백, hrv-explanation.ts generateCategoryTreatmentCards 참고 — 대표처방 포함,
          근거설명 없이 담백한 1문장 내외). 좌측 3px 컬러 바 + 아이콘은 카드4 시각화와 동일한
          고정 색상(tcm-category-visuals.ts)을 써서 시각적으로 짝을 이룬다(task.md). 변증명
          볼드+한자 병기는 hrv.ts에서 이미 후처리로 삽입돼 있어(annotateTreatmentKeywords)
          renderTreatmentBody가 그 마크업을 그대로 해석만 한다. */}
      {cards.treatmentCards.map((card, i) => (
        <div
          key={i}
          className={cardClass}
          style={{ borderLeft: `3px solid ${tcmCategoryColor(card.categoryCode)}` }}
        >
          <div className={labelClass}>
            {tcmCategoryIcon(card.categoryCode)} {card.categoryLabel}
          </div>
          <p className={bodyClass}>{renderTreatmentBody(card.body, emphasisClass, styles.hanja)}</p>
        </div>
      ))}

      <div className={cardClass} style={{ borderLeft: `3px solid ${TCM_CATEGORY_NEUTRAL_COLOR}` }}>
        <div className={labelClass}>{TCM_LIFESTYLE_ICON} 생활관리</div>
        <p className={bodyClass}>{renderWithEmphasis(cards.treatmentAndLifestyle, emphasisClass)}</p>
      </div>
    </div>
  );
}
