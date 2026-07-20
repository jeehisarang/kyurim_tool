import styles from "./HrvDetailIndicatorChart.module.css";
import {
  HRV_DETAIL_INDICATORS,
  HRV_DETAIL_REFERENCE_RANGES_PENDING_REVIEW,
  isWithinReferenceRange,
  buildDetailIndicatorComment,
  type HrvDetailIndicatorKey,
} from "@/lib/hrv-detail-indicators";
import { judgeStressIndex, judgeVascularHealthIndex, judgeVascularHealthType, type HrvSeverity } from "@/lib/hrv-thresholds";

export type HrvDetailIndicatorSummary = {
  stressIndex: number | null;
  vascularHealthIndex: number;
  vascularHealthType: string;
};

export type HrvDetailIndicatorValues = Record<HrvDetailIndicatorKey, number | null>;

function severityClass(severity: HrvSeverity | null): string {
  if (severity === "NORMAL") return styles.summaryValueNormal;
  if (severity === "CAUTION") return styles.summaryValueCaution;
  if (severity === "DANGER") return styles.summaryValueDanger;
  return "";
}

// 참고범위(min~max) 밖으로 값이 나가도 점이 트랙 가장자리에 붙어버리지 않도록, 실제
// 표시 구간을 참고범위·측정값 중 더 넓은 쪽 기준으로 여유(30%)를 두고 계산한다.
function visualBounds(min: number, max: number, value: number): { visualMin: number; visualMax: number } {
  const padding = (max - min) * 0.3 || Math.abs(value) * 0.3 || 1;
  return {
    visualMin: Math.min(min, value) - padding,
    visualMax: Math.max(max, value) + padding,
  };
}

function percent(x: number, visualMin: number, visualMax: number): number {
  if (visualMax === visualMin) return 50;
  return Math.min(100, Math.max(0, ((x - visualMin) / (visualMax - visualMin)) * 100));
}

/**
 * HRV 상세지표(TP/VLF/LF/HF/LF·HF비율/SDNN/RMSSD) 참고범위 시각화(task.md "그래프로
 * 한눈에 보이게 + 정상은 조용히, 참고범위 벗어난 것만 짧은 코멘트"). 원장용/환자용
 * 화면 모두 동일하게 렌더링한다 — 전문용어(변증명 등)가 없는 순수 수치/그래프라
 * doctorText/patientText 분리 대상이 아니다(카드7과 별개 트랙, task.md 3번).
 * 코멘트 판정은 AI가 아니라 isWithinReferenceRange의 결정론적 계산이다.
 *
 * details의 7개 필드가 전부 null이면(구버전 레코드 — 유비오맥파 CSV 자동연동 이전) 컴포넌트
 * 자체를 렌더링하지 않는다(에러 아님, task.md 4번 "이 컴포넌트 자체를 조건부로 숨김").
 */
export default function HrvDetailIndicatorChart({
  summary,
  details,
}: {
  summary: HrvDetailIndicatorSummary;
  details: HrvDetailIndicatorValues;
}) {
  const hasAnyDetail = HRV_DETAIL_INDICATORS.some((def) => details[def.key] !== null);
  if (!hasAnyDetail) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>스트레스지수</div>
          {summary.stressIndex === null ? (
            <div className={styles.summaryValueUnmeasured}>측정 안 함</div>
          ) : (
            <div className={`${styles.summaryValue} ${severityClass(judgeStressIndex(summary.stressIndex))}`}>{summary.stressIndex}</div>
          )}
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>혈관건강지수</div>
          <div className={`${styles.summaryValue} ${severityClass(judgeVascularHealthIndex(summary.vascularHealthIndex))}`}>
            {summary.vascularHealthIndex}
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>혈관건강타입</div>
          <div className={`${styles.summaryValue} ${severityClass(judgeVascularHealthType(summary.vascularHealthType))}`}>
            {summary.vascularHealthType}
          </div>
        </div>
      </div>

      <div className={styles.barList}>
        {HRV_DETAIL_INDICATORS.map((def) => {
          const value = details[def.key];
          if (value === null) return null;
          const { visualMin, visualMax } = visualBounds(def.min, def.max, value);
          const rangeLeft = percent(def.min, visualMin, visualMax);
          const rangeRight = percent(def.max, visualMin, visualMax);
          const dotLeft = percent(value, visualMin, visualMax);
          const inRange = isWithinReferenceRange(value, def.min, def.max);
          const comment = buildDetailIndicatorComment(value, def.min, def.max);

          return (
            <div key={def.key} className={styles.barRow}>
              <div className={styles.barHeader}>
                <span className={styles.barLabel}>{def.label}</span>
                <span className={styles.barSubtitle}>{def.subtitle}</span>
                <span className={styles.barValue}>{value}</span>
              </div>
              <div className={styles.track}>
                <div className={styles.trackRange} style={{ left: `${rangeLeft}%`, width: `${rangeRight - rangeLeft}%` }} />
                <div
                  className={inRange ? styles.trackDotNormal : styles.trackDotCaution}
                  style={{ left: `${dotLeft}%` }}
                />
              </div>
              {comment && <p className={styles.barComment}>{comment}</p>}
            </div>
          );
        })}
      </div>

      <p className={styles.caption}>음영 구간 = 기기 제조사 참고범위, 점 = 현재 측정값</p>
      {HRV_DETAIL_REFERENCE_RANGES_PENDING_REVIEW && (
        <p className={styles.pendingNote}>* 참고범위 수치는 원장 검수 대기 중입니다</p>
      )}
    </div>
  );
}
