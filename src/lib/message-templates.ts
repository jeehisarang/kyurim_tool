// 플레이스홀더 템플릿 — 실제 문구가 정해지면 이 상수만 교체하면 됨
export const FIXED_MESSAGE_TEMPLATE: Record<"WELCOME", string> = {
  WELCOME: "안녕하세요, 규림한의원입니다. 내원해 주셔서 감사합니다.",
};

// 검사톡(task.md) — 만남톡과 동일하게 AI 호출 없는 고정 템플릿. 환자마다 달라지는 재료가
// {환자명}/{링크}뿐이라 그 둘만 치환한다. 줄바꿈은 카카오톡 붙여넣기 시 문단 구분이 유지되도록
// 그대로 유지한다.
export function buildExamTalkTemplate(patientName: string, link: string): string {
  return [
    `${patientName}님 안녕하세요~`,
    `지난번 검사하신 검사결과가 나왔어요~!`,
    `내용 확인해 보시고 다음번 내원시 자세하게 상담 도와드리겠습니다. 오늘 하루도 화이팅입니다.`,
    `${patientName}님 검사결과를 클릭해서 확인해보세요.(안전링크)`,
    link,
  ].join("\n");
}

// 만남톡은 요구사항(4-1)상 고정 템플릿 2종을 보유해야 함.
// TODO: 아래 2개는 실제 문구 전달 전까지의 임시 플레이스홀더 — 전달되면 이 배열만 교체할 것.
export const MEETING_TALK_TEMPLATES: readonly [string, string] = [
  "안녕하세요, 규림한의원입니다. 만남톡 템플릿 1(임시) — 상담 예정일을 안내드립니다.",
  "안녕하세요, 규림한의원입니다. 만남톡 템플릿 2(임시) — 다음 방문 일정을 안내드립니다.",
];

// 사용자 노출용 표시 라벨. DB의 enum 값(DAY2/DAY7/THIRD_VISIT)은 그대로 두고 이 매핑만 바꾸면 됨.
export const TALK_MESSAGE_TYPE_LABEL: Record<"DAY2" | "DAY7" | "THIRD_VISIT", string> = {
  DAY2: "2일톡",
  DAY7: "7일톡",
  THIRD_VISIT: "3회톡",
};

// 킬팻캡슐 3일체험(TRIAL_*) 표시 라벨. 3종(웰컴/2일차/마감) 모두 AI 생성 — src/lib/ai-message.ts 참고.
export const TRIAL_TASK_TYPE_LABEL: Record<"TRIAL_WELCOME" | "TRIAL_DAY2" | "TRIAL_DEADLINE", string> = {
  TRIAL_WELCOME: "체험 웰컴톡",
  TRIAL_DAY2: "체험 2일차톡",
  TRIAL_DEADLINE: "체험 마감톡",
};

// 해피톡(처방주기 안내, task.md/13-5) 표시 라벨 — taskType은 새로 만들지 않고 기존 NEXT_DOSE를
// 그대로 재사용한다(SPLIT 처방의 "다음 처방일" TodoTask). "오늘 할 일" 화면(TodoTaskTable)에서는
// 여전히 "다음 처방일"로 표시되고, 톡생성기 쪽에서만 이 라벨을 쓴다.
export const HAPPY_TALK_TASK_TYPE_LABEL: Record<"NEXT_DOSE", string> = {
  NEXT_DOSE: "해피톡",
};

// 활동피드(ActivityLog) 문구 조립용 — WELCOME/MEETING까지 포함한 전체 톡 타입 라벨.
// EXAM(검사톡, task.md) — 웰컴/만남톡처럼 내원일 자동생성 없이 담당자가 그때그때 만드는
// 6번째 유형. TodoTask 없이 MessageLog만으로 발송함/안함을 추적한다(웰컴/만남톡과 동일 원칙).
export const MESSAGE_TYPE_LABEL: Record<string, string> = {
  WELCOME: "웰컴 메시지",
  MEETING: "만남톡",
  EXAM: "검사톡",
  ...TALK_MESSAGE_TYPE_LABEL,
  ...TRIAL_TASK_TYPE_LABEL,
  ...HAPPY_TALK_TASK_TYPE_LABEL,
};
