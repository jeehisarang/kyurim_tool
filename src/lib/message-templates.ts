// 플레이스홀더 템플릿 — 실제 문구가 정해지면 이 상수만 교체하면 됨
export const FIXED_MESSAGE_TEMPLATE: Record<"WELCOME" | "MEETING", string> = {
  WELCOME: "안녕하세요, 규림한의원입니다. 내원해 주셔서 감사합니다.",
  MEETING: "안녕하세요, 규림한의원입니다. 상담 예정일을 안내드립니다.",
};

// 사용자 노출용 표시 라벨. DB의 enum 값(DAY2/DAY7/THIRD_VISIT)은 그대로 두고 이 매핑만 바꾸면 됨.
export const TALK_MESSAGE_TYPE_LABEL: Record<"DAY2" | "DAY7" | "THIRD_VISIT", string> = {
  DAY2: "2일톡",
  DAY7: "7일톡",
  THIRD_VISIT: "3회톡",
};
