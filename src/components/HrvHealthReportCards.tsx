"use client";

import type { ReactNode } from "react";
import { PieChart, Pie, Cell } from "recharts";
import styles from "./HrvHealthReportCards.module.css";
import type { HealthReportCards, PatientSafeHealthReportCards, CategoryVisualizationView } from "@/lib/patient-view";
import { tcmCategoryColor, tcmCategoryColorDark, tcmCategoryIcon, TCM_CATEGORY_NEUTRAL_COLOR, TCM_LIFESTYLE_ICON } from "@/lib/tcm-category-visuals";

// 카드7 공통 캡션(task.md) — AI가 만드는 게 아니라 컴포넌트 고정 문구. 카테고리별 카드마다
// 반복하지 않고 카드7 맨 아래(클로징 헤드라인 바로 아래) 한 번만 노출한다.
const TREATMENT_COMMON_CAPTION = "현재 증상에 맞는 구체적인 치료는 상담을 통해 결정됩니다";

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
// text가 문자열이 아니면(예: 프론트 번들과 저장된 데이터의 카드7 스키마 버전이 어긋나
// doctorText/patientText가 undefined인 경우 — 실제로 link.kyurim.kr /s/[token] 크래시로
// 발생 확인, task.md 버그 리포트) 빈 배열을 반환해 이 카드 하나만 조용히 비워지게 한다
// (.split() 호출 전에 막아 전체 카드7 섹션이 죽는 것을 방지).
function renderTreatmentBody(text: string, emphasisClassName: string, hanjaClassName: string): ReactNode[] {
  if (typeof text !== "string") return [];
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

// 카드7 환자용 치료방향 카드 전용(task.md "환자용/원장용 분리") — doctorText와 달리 한자
// 병기가 없고(patientText 자체에 전문용어가 없으므로), ** 로 감싼 구간을 카테고리별
// 진한 톤(800 단계, tcmCategoryColorDark)으로 볼드 처리한다. 고정 CSS 클래스가 아니라
// 카테고리마다 다른 색이라 인라인 style로 적용한다.
function renderPatientTreatmentText(text: string, categoryCode: string): ReactNode[] {
  if (typeof text !== "string") return [];
  const color = tcmCategoryColorDark(categoryCode);
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} style={{ color }}>
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
  // staff는 doctorText가 포함된 "전체" 뷰(HealthReportCards), patient는 doctorText가 아예
  // 없는 화이트리스트 뷰(PatientSafeHealthReportCards) — variant prop이 실제 어느 타입이
  // 왔는지 결정하며, 호출측(staff 페이지 vs 환자화면)이 항상 서로 맞는 조합으로만 호출한다.
  cards: HealthReportCards | PatientSafeHealthReportCards;
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
      {cards.treatmentCards.map((card, i) => {
        // 카드7 스키마 버전 불일치 방어(task.md 버그 리포트 — link.kyurim.kr /s/[token]
        // 크래시 실사례: 브라우저에 남아있던 구버전 JS 번들이, 세션 중 재생성으로 신버전
        // 스키마(doctorText/patientText)로 바뀐 데이터를 구버전 필드(body)로 읽으려다
        // undefined.split()으로 죽었다. parseTreatmentCardsJson이 이미 타입 검증을 하지만,
        // 여기서 한 번 더 방어해서 어떤 경로로든 필드가 비어있으면 카드 전체를 죽이지 않고
        // 그 카테고리 카드 하나만 조용히 스킵한다(에러 아님).
        const text = isPatient ? (card as { patientText?: unknown }).patientText : (card as { doctorText?: unknown }).doctorText;
        if (typeof text !== "string" || !text) return null;
        return (
          <div key={i} className={cardClass} style={{ borderLeft: `3px solid ${tcmCategoryColor(card.categoryCode)}` }}>
            <div className={labelClass}>
              {tcmCategoryIcon(card.categoryCode)} {card.categoryLabel}
            </div>
            <p className={bodyClass}>
              {isPatient ? renderPatientTreatmentText(text, card.categoryCode) : renderTreatmentBody(text, emphasisClass, styles.hanja)}
            </p>
          </div>
        );
      })}

      <div className={cardClass} style={{ borderLeft: `3px solid ${TCM_CATEGORY_NEUTRAL_COLOR}` }}>
        <div className={labelClass}>{TCM_LIFESTYLE_ICON} 생활관리</div>
        <p className={bodyClass}>{renderWithEmphasis(cards.treatmentAndLifestyle, emphasisClass)}</p>
      </div>

      {/* 클로징 헤드라인(task.md "미병 프레임 복원") — 카드7 맨 아래, 그날 후보 카테고리
          전체를 "따로가 아니라 함께" 흐름으로 엮고 미병(未病)/치미병(治未病)으로 마무리.
          원장용/환자용 공통 노출(전문용어 없는 문구라 분리 불필요) — 옛 레코드는 null이라
          카드 자체를 숨긴다(에러 아님, 재생성 전까지 조건부 미노출). 부분 강조만 허용되므로
          카드4/7과 달리 emphasisClass가 아니라 전용 accent 클래스를 쓴다. */}
      {cards.closingHeadline && (
        <div className={styles.closingCard}>
          <p className={styles.closingBody}>{renderWithEmphasis(cards.closingHeadline, styles.closingEmphasis)}</p>
        </div>
      )}

      {/* 카드7 공통 캡션(task.md, 컴포넌트 고정 문구) — 환자화면 전용(원장 확인화면은 이미
          변증명·방제까지 다 보고 있어 "상담을 통해 결정됩니다" 안내가 불필요). 카테고리
          카드가 실제로 있을 때만 노출한다(옛 레코드처럼 카드7 자체가 비어 있으면 캡션도
          함께 숨김). */}
      {isPatient && cards.treatmentCards.length > 0 && <p className={styles.treatmentCaption}>{TREATMENT_COMMON_CAPTION}</p>}
    </div>
  );
}
