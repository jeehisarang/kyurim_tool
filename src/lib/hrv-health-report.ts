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

// 치료방향 카드 키워드 불릿 고정 사전(과거 커밋 d5fd073 — "AI가 매번 다듬지 않고 원장이
// 최종 확정한 고정 설명 사전을 그대로 노출"). 이후 "교과서적이고 도움 안 되는" 느낌이라는
// 피드백으로 카드 렌더링은 다시 AI 개인화 버전(hrv-explanation.ts generateCategoryTreatmentCards,
// 커밋 48dbc6e 계열)으로 롤백됐다(task.md) — 이 사전/buildCategoryTreatmentCards는 현재
// 카드 렌더링 경로에서 호출되지 않지만, 추후 다른 용도로 재사용할 가능성이 있어 삭제하지
// 않고 남겨둔다(task.md 명시 지시). 키는 TcmCategory.categoryCode와 정확히 일치해야 한다.
const TREATMENT_PRINCIPLE_KEYWORD_GLOSSARY: Record<string, { keyword: string; description: string }[]> = {
  EMOTION_STAGNATION: [
    { keyword: "소간해울·이기해울", description: "몸 안에 막힌 기운을 풀어 답답함을 덜어줍니다" },
    { keyword: "청간사화", description: "치밀어 오르는 열감과 짜증을 가라앉혀 줍니다" },
    { keyword: "양심안신", description: "마음을 안정시켜 편안하게 해줍니다" },
  ],
  QI_YANG_DEFICIENCY: [
    { keyword: "보기익기", description: "부족한 기운을 채워 활력을 되찾게 도와줍니다" },
    { keyword: "건비익기", description: "소화 기능을 도와 에너지 생성을 돕습니다" },
    { keyword: "온양산한", description: "몸을 따뜻하게 데워 냉증을 완화합니다" },
    { keyword: "온보비신", description: "몸의 근본적인 체력을 보강해줍니다" },
  ],
  YIN_DRYNESS: [
    { keyword: "자음생진", description: "부족한 진액을 채워 건조함을 촉촉하게 해줍니다" },
    { keyword: "자음청열", description: "몸에 쌓인 열을 내려 건조·열감을 가라앉힙니다" },
    { keyword: "자음강화", description: "몸의 수분과 열의 균형을 맞춰줍니다" },
    { keyword: "보익간신", description: "간과 신장의 기능을 보강해 회복을 돕습니다" },
  ],
  DIGESTIVE: [
    { keyword: "건비화위", description: "비위 기능을 튼튼히 해 소화를 돕습니다" },
    { keyword: "이기화중", description: "막힌 기운을 풀어 속을 편하게 합니다" },
    { keyword: "소도화적", description: "정체된 음식물을 내려 더부룩함을 덜어줍니다" },
    { keyword: "화담강역", description: "위로 치받는 기운을 가라앉혀 줍니다" },
  ],
  PHLEGM_DAMPNESS: [
    { keyword: "건비화습", description: "소화 기능을 강화해 습기가 쌓이지 않게 돕습니다" },
    { keyword: "화담이수", description: "끈적한 습기를 몸 밖으로 배출시켜줍니다" },
    { keyword: "이수소종", description: "고인 물기를 내보내 부기를 가라앉힙니다" },
    { keyword: "온양화수", description: "몸을 데워 수분 대사를 원활하게 합니다" },
  ],
  BLOOD_DEFICIENCY: [
    { keyword: "보혈양혈", description: "부족한 혈을 채워줍니다" },
    { keyword: "익기생혈", description: "기운을 보강해 혈이 만들어지도록 돕습니다" },
    { keyword: "양심안신", description: "마음을 안정시켜 편안하게 해줍니다" },
    { keyword: "건비생혈", description: "소화 기능을 도와 혈이 잘 생성되게 합니다" },
  ],
  BLOOD_STASIS: [
    { keyword: "활혈거어", description: "혈액순환을 원활하게 해 어혈을 풀어줍니다" },
    { keyword: "행기활혈", description: "기와 혈의 흐름을 함께 개선해줍니다" },
    { keyword: "통락지통", description: "막힌 순환으로 인한 통증을 덜어줍니다" },
    { keyword: "온경산한", description: "몸속 냉기를 풀어 순환을 촉진합니다" },
  ],
};

export type GlossaryTreatmentCard = {
  categoryLabel: string;
  items: { keyword: string; description: string }[];
};

/**
 * 후보 카테고리별 치료방향 카드를 고정 사전에서 조회해 만든다(AI 호출 없음, task.md).
 * - 사전에 categoryCode 자체가 없으면(향후 카테고리 확장 등 대비): 콘솔 경고를 남기고
 *   카테고리명만 노출하는 축소 카드를 만든다(조용히 빠지는 것보다 눈에 띄게 처리하라는
 *   지시) — 설명 없이 카테고리명 하나만 담긴 항목 1개로 표시.
 * - 사전에는 있는데 키워드 배열이 비어있으면: 카드 자체를 스킵한다(기존 "치료원칙
 *   미입력 시 카드 생성 안 함" 안전장치와 동일 취급).
 */
export function buildCategoryTreatmentCards(
  candidates: { categoryCode: string; patientLabel: string }[],
): GlossaryTreatmentCard[] {
  const cards: GlossaryTreatmentCard[] = [];
  for (const c of candidates) {
    const entries = TREATMENT_PRINCIPLE_KEYWORD_GLOSSARY[c.categoryCode];
    if (entries === undefined) {
      console.warn(
        `[hrv-health-report] 치료방향 키워드 사전에 없는 카테고리코드: ${c.categoryCode}(${c.patientLabel}) — 축소 카드로 표시합니다.`,
      );
      cards.push({ categoryLabel: c.patientLabel, items: [{ keyword: c.patientLabel, description: "" }] });
      continue;
    }
    if (entries.length === 0) continue;
    cards.push({ categoryLabel: c.patientLabel, items: entries });
  }
  return cards;
}

// 카드4(한의건강해석) 상단 카테고리 비중 시각화 — 도넛+막대 조합(task.md, 원장 확정안).
// 계산 방식은 "전체 응답 문항 만점 대비 원점수 비율"(정규화 없음) — 여기서 "전체"는 체크
// 리스트 전체(7개 카테고리 모든 문항)의 만점 합계다. 각 후보의 rawScore를 그 공통 분모로
// 나눈 값이라 후보끼리 원점수가 다르면 비중도 서로 다르게 나온다(예: 2문항 카테고리 18%
// vs 1문항 카테고리 9%) — "정규화 없음"은 카테고리별로 재정규화(자기 자신의 만점 기준으로
// 다시 0~100%를 채우는 것)하지 않는다는 뜻이지, 모든 후보가 항상 같은 값이 된다는 뜻이
// 아니다(회귀 조사 결론, task.md). 도넛은 후보 카테고리들 + "기타"(후보 아닌 나머지 비중)
// 한 조각, 막대는 후보 카테고리만 라벨+퍼센트로 보여준다. 후보 비율의 합이 100%를 넘어도
// 재분배(rescale)하지 않고 "기타"만 0으로 clamp한다.
export type CategoryShareSlice = { categoryCode: string; categoryLabel: string; ratioPercent: number };
export type CategoryVisualization = { slices: CategoryShareSlice[]; otherPercent: number };

export function buildCategoryVisualization(
  candidates: { categoryCode: string; patientLabel: string; rawScore: number; totalMaxScore: number }[],
): CategoryVisualization {
  const slices = candidates.map((c) => ({
    categoryCode: c.categoryCode,
    categoryLabel: c.patientLabel,
    ratioPercent: c.totalMaxScore > 0 ? Math.round((c.rawScore / c.totalMaxScore) * 100) : 0,
  }));
  const sumPercent = slices.reduce((sum, s) => sum + s.ratioPercent, 0);
  const otherPercent = Math.max(0, 100 - sumPercent);
  return { slices, otherPercent };
}

// 변증명(치료원칙 키워드) 한자 병기 고정 사전(task.md) — AI가 만들지 않고 코드가 후처리로
// 삽입한다. ⚠ 원장님이 최종 검수 후 확정할 값 — 지금은 초안이다. "양심안신"처럼 카테고리
// 둘(스트레스·정서긴장/혈허 경향)에 동시에 등장하는 키워드는 카테고리 문맥과 무관하게
// 항상 같은 한자를 쓴다(task.md 지시) — 그래서 원본 표에는 28회 언급되지만 고유 키는 27개.
export const TREATMENT_KEYWORD_HANJA: Record<string, string> = {
  소간해울: "疏肝解鬱",
  이기해울: "理氣解鬱",
  청간사화: "淸肝瀉火",
  양심안신: "養心安神",
  보기익기: "補氣益氣",
  건비익기: "健脾益氣",
  온양산한: "溫陽散寒",
  온보비신: "溫補脾腎",
  자음생진: "滋陰生津",
  자음청열: "滋陰淸熱",
  자음강화: "滋陰降火",
  보익간신: "補益肝腎",
  건비화위: "健脾和胃",
  이기화중: "理氣和中",
  소도화적: "消導化積",
  화담강역: "化痰降逆",
  건비화습: "健脾化濕",
  화담이수: "化痰利水",
  이수소종: "利水消腫",
  온양화수: "溫陽化水",
  보혈양혈: "補血養血",
  익기생혈: "益氣生血",
  건비생혈: "健脾生血",
  활혈거어: "活血祛瘀",
  행기활혈: "行氣活血",
  통락지통: "通絡止痛",
  온경산한: "溫經散寒",
};

// 카테고리의 원본 treatmentPrinciple 텍스트(예: "소간해울, 이기해울, 청간사화, 양심안신의
// 치료 방향을 고려할 수 있습니다.\n증상에 따라 시호소간산·... 계열 등이 참고될 수
// 있습니다.")에서 대표처방/문장은 빼고 치료원칙 키워드만 추출한다 — 이 형식이 전 카테고리
// 시드 문구에 고정돼 있음을 전제한다(형식이 바뀌면 이 파서도 함께 손봐야 함).
export function extractTreatmentKeywords(treatmentPrinciple: string | null): string[] {
  if (!treatmentPrinciple) return [];
  const match = /^(.+?)의\s*치료\s*방향을\s*고려할\s*수\s*있습니다/.exec(treatmentPrinciple);
  if (!match) return [];
  return match[1]
    .split(/[,、]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 키워드가 이미 AI 출력 자체에서 **로 감싸져 있으면 건드리지 않는다(카드7 프롬프트가 이
// 키워드를 볼드하라고 지시하지 않아 실제로는 거의 발생하지 않지만, 이중/깨진 마크업을
// 구조적으로 막기 위한 안전장치 — hrv-explanation.ts의 isAlreadyBolded와 동일 원칙).
function isAlreadyBolded(text: string, target: string): boolean {
  const boldSpans = [...text.matchAll(/\*\*(.+?)\*\*/g)];
  return boldSpans.some(([, inner]) => inner.includes(target));
}

/**
 * 카드7 치료방향 카드 본문에 변증명 볼드+한자 병기를 후처리로 삽입한다(task.md, AI 출력
 * 자체는 건드리지 않고 후처리로만 추가). 사전에 없는 키워드(향후 카테고리 확장 등)는
 * 볼드만 적용하고 한자는 생략 + 콘솔 경고 — 지어낸 한자를 붙이는 것보다 안전하다.
 */
export function annotateTreatmentKeywords(body: string, keywords: string[]): string {
  let result = body;
  for (const keyword of keywords) {
    if (!result.includes(keyword) || isAlreadyBolded(result, keyword)) continue;
    const hanja = TREATMENT_KEYWORD_HANJA[keyword];
    if (!hanja) {
      console.warn(`[hrv-health-report] 한자 사전에 없는 변증명 키워드: ${keyword} — 볼드만 적용합니다.`);
    }
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "g"), hanja ? `**${keyword}**(${hanja})` : `**${keyword}**`);
  }
  return result;
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
