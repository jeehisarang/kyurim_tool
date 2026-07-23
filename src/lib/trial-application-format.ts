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

function bodyTypeLine(app: TrialApplicationForFormat, index: number): string {
  const q = BODY_TYPE_QUESTIONS[index];
  const value = app[q.key];
  const otherText = app[`${q.key}Other` as keyof TrialApplicationForFormat] as string | null;
  const optionLabel = q.options.find((o) => o.value === value)?.label;
  const answer = value === BODY_TYPE_OTHER_VALUE ? `기타(${otherText?.trim() || "미입력"})` : (optionLabel ?? value);
  return `${q.question} → ${answer}`;
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
  return lines.join("\n");
}
