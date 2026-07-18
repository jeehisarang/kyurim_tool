import type { CheckedSymptomItem, CandidateCategoryRank } from "@/lib/tcm-checklist";

// 건강 리포트(task.md) 카드3 "이번 검사에서 주목할 변화" — 지어내면 안 되는 정확한 수치
// 비교라 AI가 아니라 코드가 결정론적으로 계산한다(카드2/6과 동일 원칙). 직전 대비 변화폭이
// 큰 2~3개만 선별하고 전체를 나열하지 않는다(task.md 지시).

export type NotableChange = { label: string; direction: "IMPROVED" | "ATTENTION"; sentence: string };

// 서로 다른 단위(지수/%/bpm/등급)를 하나의 "변화폭" 기준으로 비교하기 위한 정규화 나눗값 —
// 정확한 임상적 기준이 아니라 상대적 우선순위를 매기기 위한 근사치다(task.md에 정확한
// 컷오프가 없어 합리적으로 가정, 완료보고에 명시). 실제 서비스 운영하며 조정 가능.
const VASCULAR_INDEX_DIVISOR = 10;
const STRESS_INDEX_DIVISOR = 15;
const AVG_PULSE_DIVISOR = 10;
const VASCULAR_TYPE_MAGNITUDE = 1.5; // 등급 변화는 "값"이 아니라 "안정권 이탈/진입" 여부라 고정 가중치

// 혈관건강도 등급 중 상대적으로 안정적인 쪽(A/B) — 나머지(C 이하)는 "관찰 필요" 쪽으로 본다.
const STABLE_VASCULAR_TYPES = ["A", "B"];

type Direction = "IMPROVED" | "ATTENTION";

function directionByLowerIsBetter(prev: number, curr: number, divisor: number): { direction: Direction; magnitude: number } | null {
  const diff = curr - prev;
  if (diff === 0) return null;
  return { direction: diff < 0 ? "IMPROVED" : "ATTENTION", magnitude: Math.abs(diff) / divisor };
}

function directionForAvgPulse(prev: number, curr: number): { direction: Direction; magnitude: number } | null {
  const prevInRange = prev >= 60 && prev <= 100;
  const currInRange = curr >= 60 && curr <= 100;
  if (prevInRange === currInRange) return null; // 둘 다 범위 안/밖이면 이번 라운드는 변화로 취급하지 않음(단순화)
  return { direction: currInRange ? "IMPROVED" : "ATTENTION", magnitude: Math.abs(curr - prev) / AVG_PULSE_DIVISOR };
}

function directionForVascularHealthType(prev: string, curr: string): { direction: Direction; magnitude: number } | null {
  if (prev === curr) return null;
  const prevStable = STABLE_VASCULAR_TYPES.includes(prev);
  const currStable = STABLE_VASCULAR_TYPES.includes(curr);
  if (prevStable === currStable) return null; // 둘 다 안정권/불안정권이면 이번 라운드는 변화로 취급하지 않음
  return { direction: currStable ? "IMPROVED" : "ATTENTION", magnitude: VASCULAR_TYPE_MAGNITUDE };
}

// 라벨별 정확한 한국어 조사("이"/"가") — 4개뿐이라 규칙 대신 고정 매핑으로 문법 오류를 없앤다.
const LABEL_PARTICLE: Record<string, string> = {
  혈관건강지수: "가",
  혈관건강도: "가",
  평균맥박: "이",
  스트레스지수: "가",
};

function toSentence(label: string, direction: Direction): string {
  const particle = LABEL_PARTICLE[label] ?? "이";
  return direction === "IMPROVED"
    ? `${label}${particle} 직전 검사 대비 안정적인 방향으로 변화하는 흐름입니다.`
    : `${label}${particle} 직전 검사 대비 관찰이 필요한 방향으로 변화했습니다.`;
}

export type HrvMetricsSnapshot = {
  vascularHealthIndex: number;
  vascularHealthType: string;
  avgPulse: number;
  stressIndex: number | null;
};

/**
 * 카드3 "이번 검사에서 주목할 변화" 계산 — 직전 기록이 없으면(첫 검사) 빈 배열(카드 숨김).
 * 변화폭 상위 최대 3개만 반환한다(task.md "전체 나열 금지").
 */
export function computeNotableChanges(previous: HrvMetricsSnapshot, current: HrvMetricsSnapshot): NotableChange[] {
  const candidates: { label: string; direction: Direction; magnitude: number }[] = [];

  const vhi = directionByLowerIsBetter(previous.vascularHealthIndex, current.vascularHealthIndex, VASCULAR_INDEX_DIVISOR);
  if (vhi) candidates.push({ label: "혈관건강지수", ...vhi });

  const vht = directionForVascularHealthType(previous.vascularHealthType, current.vascularHealthType);
  if (vht) candidates.push({ label: "혈관건강도", ...vht });

  const pulse = directionForAvgPulse(previous.avgPulse, current.avgPulse);
  if (pulse) candidates.push({ label: "평균맥박", ...pulse });

  if (previous.stressIndex !== null && current.stressIndex !== null) {
    const si = directionByLowerIsBetter(previous.stressIndex, current.stressIndex, STRESS_INDEX_DIVISOR);
    if (si) candidates.push({ label: "스트레스지수", ...si });
  }

  return candidates
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 3)
    .map((c) => ({ label: c.label, direction: c.direction, sentence: toSentence(c.label, c.direction) }));
}

// 카드7(치료방향+생활관리) 고정 문구(task.md "치료 방향 + 생활관리" — "구체적인 처방과 치료
// 기간은 문진·설진·맥진 후 원장님과 상담" 문구 고정) — AI가 매번 다르게 쓰거나 생략할 수
// 있으므로 ensureArrhythmiaNotice와 동일한 원칙으로 코드가 결정적으로 보장한다.
const TREATMENT_CONSULT_DISCLAIMER = "구체적인 처방과 치료 기간은 문진·설진·맥진 후 원장님과 상담을 통해 정합니다.";

export function ensureTreatmentConsultDisclaimer(text: string): string {
  if (text.includes("원장님과 상담")) return text;
  return `${text} ${TREATMENT_CONSULT_DISCLAIMER}`;
}

/**
 * 카드1(헤드라인) 재료 선정(정책 변경, 2026-07-18) — 이전에는 후보 카테고리를 구분하지
 * 않고 체크 문항을 전부 모아 상위 2개만 뽑았는데(카테고리 3개 이상 동점이면 일부 카테고리가
 * 헤드라인에서 아예 누락되는 문제가 있었음), 이제는 "카테고리당 1개씩" 뽑는다:
 * 1) 후보 카테고리가 4개 이상이면 점수(ratio→rawScore) 상위 3개 카테고리만 남기고,
 *    3개 이하면 전부 사용한다.
 * 2) 남은 각 카테고리에서 "심하다"(score=2) 문항을 우선 고르고, 없으면 "경미하다"(score=1)
 *    문항을 고른다(카테고리당 정확히 1개 — 후보는 정의상 rawScore>0이라 항상 1개는 있다).
 * 결과 배열 길이는 항상 min(후보 카테고리 수, 3)이다.
 */
export function pickHeadlineSymptoms(candidateCategories: CandidateCategoryRank[], items: CheckedSymptomItem[]): string[] {
  const topCategoryIds = [...candidateCategories]
    .sort((a, b) => b.ratio - a.ratio || b.rawScore - a.rawScore)
    .slice(0, 3)
    .map((c) => c.categoryId);

  return topCategoryIds
    .map((categoryId) => {
      const categoryItems = items.filter((i) => i.categoryId === categoryId);
      const severe = categoryItems.find((i) => i.score === 2);
      if (severe) return severe.patientQuestion;
      return categoryItems.find((i) => i.score === 1)?.patientQuestion ?? null;
    })
    .filter((s): s is string => s !== null);
}
