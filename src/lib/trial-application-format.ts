// 몸타입 6문항(task2.md 확정 문구) — 공개 신청폼(TrialApplicationForm)의 카드형 버튼과
// /prescriptions/new 프리필 텍스트(formatTrialApplicationText)가 동일 문구를 참조한다.
export const BODY_TYPE_QUESTIONS: {
  key: "bodyType1" | "bodyType2" | "bodyType3" | "bodyType4" | "bodyType5" | "bodyType6";
  question: string;
  options: { value: "A" | "B" | "C" | "D" | "E"; label: string }[];
}[] = [
  {
    key: "bodyType1",
    question: "살이 찌는 가장 큰 이유는?",
    options: [
      { value: "A", label: "식욕이 세고 자주 배고파요" },
      { value: "B", label: "몸이 잘 붓고 무거워요" },
      { value: "C", label: "스트레스 받으면 못 참아요" },
      { value: "D", label: "예전보다 대사가 떨어졌어요" },
      { value: "E", label: "생리 전 식욕·붓기가 심해요(해당시)" },
    ],
  },
  {
    key: "bodyType2",
    question: "가장 고민되는 부위는?",
    options: [
      { value: "A", label: "배·허리" },
      { value: "B", label: "얼굴·다리" },
      { value: "C", label: "등·팔뚝(상체)" },
      { value: "D", label: "전신" },
      { value: "E", label: "생리 전 특히(해당시)" },
    ],
  },
  {
    key: "bodyType3",
    question: "평소 몸 상태는?",
    options: [
      { value: "A", label: "열 많고 땀 많아요" },
      { value: "B", label: "습하고 무거워요" },
      { value: "C", label: "얼굴·상체로 열이 올라요" },
      { value: "D", label: "추위 타고 손발이 차요" },
      { value: "E", label: "생리 전 열감·부종 같이 와요(해당시)" },
    ],
  },
  {
    key: "bodyType4",
    question: "식사할 때 나는?",
    options: [
      { value: "A", label: "배고파서 많이 먹어요" },
      { value: "B", label: "안 고픈데 계속 먹게 돼요" },
      { value: "C", label: "스트레스 받으면 단 게 당겨요" },
      { value: "D", label: "적게 먹어도 잘 쪄요" },
      { value: "E", label: "생리 전 단 것·기름진 것 당겨요(해당시)" },
    ],
  },
  {
    key: "bodyType5",
    question: "배 속 상태는?",
    options: [
      { value: "A", label: "변비 있어요" },
      { value: "B", label: "더부룩하고 부어요" },
      { value: "C", label: "가스 차고 불편해요" },
      { value: "D", label: "대체로 편안해요" },
      { value: "E", label: "생리 전 더 막혀요(해당시)" },
    ],
  },
  {
    key: "bodyType6",
    question: "이번에 가장 원하는 변화는?",
    options: [
      { value: "A", label: "식욕 줄이고 가볍게" },
      { value: "B", label: "붓기 없이 산뜻하게" },
      { value: "C", label: "감정폭식 줄이고 안정되게" },
      { value: "D", label: "대사 올려 활력 있게" },
      { value: "E", label: "생리주기 영향 없이 일정하게(해당시)" },
    ],
  },
];

export const BODY_TYPE_OTHER_VALUE = "기타";
// 원본 구글폼이 "최대 2개까지" 선택 가능한 체크박스 문항이라(task.md 보완 1항), 이 앱도
// 동일하게 문항당 최대 2개까지만 허용한다.
export const BODY_TYPE_MAX_SELECTIONS = 2;

export type BodyTypeLetter = "A" | "B" | "C" | "D" | "E";

export type TrialApplicationForFormat = {
  name: string;
  phone: string;
  heightWeight: string | null;
  weightGoalKg: string | null;
  weightChange6mo: string | null;
  currentMeds: string | null;
  pastHistory: string | null;
  familyHistory: string | null;
  dietExperience: string | null;
  // 문항당 최대 2개 선택 결과를 JSON 배열 문자열로 저장한다(예: '["A","C"]') — 단일 값
  // 저장 방식에서 변경됨(task.md 보완 1항). parseBodyTypeAnswer로 파싱해서 쓴다.
  bodyType1: string;
  bodyType1Other: string | null;
  bodyType2: string;
  bodyType2Other: string | null;
  bodyType3: string;
  bodyType3Other: string | null;
  bodyType4: string;
  bodyType4Other: string | null;
  bodyType5: string;
  bodyType5Other: string | null;
  bodyType6: string;
  bodyType6Other: string | null;
};

/** JSON 배열 문자열을 파싱한다 — 형식이 깨졌으면 빈 배열(화면이 죽지 않도록 방어). */
export function parseBodyTypeAnswer(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    // 파싱 실패 시 빈 배열로 취급
  }
  return [];
}

function bodyTypeAnswerLabel(q: (typeof BODY_TYPE_QUESTIONS)[number], values: string[], otherText: string | null): string {
  if (values.length === 0) return "미응답";
  const parts = values.map((v) => {
    if (v === BODY_TYPE_OTHER_VALUE) return `기타(${otherText?.trim() || "미입력"})`;
    const label = q.options.find((o) => o.value === v)?.label;
    return label ? `${v}. ${label}` : v;
  });
  return parts.join(" / ");
}

function bodyTypeLine(app: TrialApplicationForFormat, index: number): string {
  const q = BODY_TYPE_QUESTIONS[index];
  const values = parseBodyTypeAnswer(app[q.key]);
  const otherText = app[`${q.key}Other` as keyof TrialApplicationForFormat] as string | null;
  return `${q.question} → ${bodyTypeAnswerLabel(q, values, otherText)}`;
}

/** /prescriptions/new 설문 textarea 프리필용 — formatSurveyResponseText와 동일한 역할. */
export function formatTrialApplicationText(app: TrialApplicationForFormat): string {
  const lines: string[] = [
    `이름: ${app.name}`,
    `연락처: ${app.phone}`,
    `키/체중: ${app.heightWeight || "없음"}`,
    `감량목표(kg): ${app.weightGoalKg || "없음"}`,
    `최근 6개월 체중변화: ${app.weightChange6mo || "없음"}`,
    `복용약물: ${app.currentMeds || "없음"}`,
    `병력: ${app.pastHistory || "없음"}`,
    `가족력: ${app.familyHistory || "없음"}`,
    `다이어트 경험: ${app.dietExperience || "없음"}`,
  ];
  for (let i = 0; i < BODY_TYPE_QUESTIONS.length; i++) {
    lines.push(bodyTypeLine(app, i));
  }
  const dominant = computeDominantBodyType(app);
  lines.push(`우세타입: ${formatDominantBodyTypeLabel(dominant.letters)}`);
  return lines.join("\n");
}

export type DominantBodyTypeResult = { letters: BodyTypeLetter[]; tally: Record<BodyTypeLetter, number> };

/**
 * 우세타입 계산(task.md 보완 1항) — 6문항 응답 전체에서 A~E(기타 제외) 등장 횟수를 합산해
 * 가장 많이 나온 알파벳을 우세타입으로 산출한다. 동점이면 전부 반환(화면에서 "A, C 동점"
 * 형태로 표시).
 */
export function computeDominantBodyType(app: TrialApplicationForFormat): DominantBodyTypeResult {
  const tally: Record<BodyTypeLetter, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const q of BODY_TYPE_QUESTIONS) {
    for (const value of parseBodyTypeAnswer(app[q.key])) {
      if (value in tally) tally[value as BodyTypeLetter] += 1;
    }
  }
  const max = Math.max(...Object.values(tally));
  const letters = max === 0 ? [] : (Object.keys(tally) as BodyTypeLetter[]).filter((l) => tally[l] === max);
  return { letters, tally };
}

export function formatDominantBodyTypeLabel(letters: BodyTypeLetter[]): string {
  if (letters.length === 0) return "-";
  if (letters.length === 1) return letters[0];
  return `${letters.join(", ")} 동점`;
}
