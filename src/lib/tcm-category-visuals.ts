// TCM 카테고리 고정 색상/아이콘 매핑(task.md) — 카드4(한의건강해석) 상단 시각화와 카드7
// (치료 방향) 카드가 동일 카테고리에서 항상 같은 색으로 보이도록 이 파일 한 곳에서만
// 관리한다(두 군데서 색이 따로 관리되면 어긋날 위험). 등장 순서가 아니라 카테고리 고유 색.
export const TCM_CATEGORY_COLOR_MAP: Record<string, string> = {
  EMOTION_STAGNATION: "#2a78d6", // 스트레스·정서긴장 — 파랑
  QI_YANG_DEFICIENCY: "#eb6834", // 기력·냉증 — 주황
  YIN_DRYNESS: "#1baf7a", // 열감·건조 — 청록
  DIGESTIVE: "#eda100", // 소화기 — 노랑
  PHLEGM_DAMPNESS: "#e87ba4", // 담습·부종 — 분홍
  BLOOD_DEFICIENCY: "#008300", // 혈허 경향 — 초록
  BLOOD_STASIS: "#4a3aa7", // 순환·어혈 — 보라
};

// "기타"(도넛) / 생활관리(공통) 카드 등 특정 카테고리에 속하지 않는 항목의 중립색.
export const TCM_CATEGORY_NEUTRAL_COLOR = "#8a8a8a";

export function tcmCategoryColor(categoryCode: string): string {
  return TCM_CATEGORY_COLOR_MAP[categoryCode] ?? TCM_CATEGORY_NEUTRAL_COLOR;
}

// 환자용 카드7(task.md "환자용/원장용 분리") 볼드 강조 전용 — 카테고리 원색 그대로는
// 흰 배경에서 대비가 약해 진한 톤("800 단계")으로 별도 관리한다. 위 TCM_CATEGORY_COLOR_MAP과
// 1:1 대응하되 채도는 유지하고 명도만 낮춘 값(Tailwind 800 계열 참고).
const TCM_CATEGORY_COLOR_DARK_MAP: Record<string, string> = {
  EMOTION_STAGNATION: "#1e4e8c",
  QI_YANG_DEFICIENCY: "#9a3412",
  YIN_DRYNESS: "#0f6b4c",
  DIGESTIVE: "#92400e",
  PHLEGM_DAMPNESS: "#9d174d",
  BLOOD_DEFICIENCY: "#166534",
  BLOOD_STASIS: "#4c1d95",
};

export function tcmCategoryColorDark(categoryCode: string): string {
  return TCM_CATEGORY_COLOR_DARK_MAP[categoryCode] ?? "#333333";
}

// 아이콘(task.md 요청: mood-sad/temperature-minus/flame/stomach/droplet/heartbeat/
// activity/heart) — 이 프로젝트엔 아이콘 라이브러리가 설치돼 있지 않다(package.json 확인
// 완료). 기존 관례(program-categories.ts의 PROGRAM_CATEGORY_ICON)를 그대로 따라 이모지로
// 대체했다 — 요청하신 8개 아이콘명은 전부 Tabler/Phosphor류 아이콘 라이브러리 식별자라
// 이 프로젝트엔 하나도 존재하지 않는 상태다(완료보고에 대체 내역 명시).
export const TCM_CATEGORY_ICON: Record<string, string> = {
  EMOTION_STAGNATION: "😔", // mood-sad 대체
  QI_YANG_DEFICIENCY: "🥶", // temperature-minus 대체
  YIN_DRYNESS: "🔥", // flame
  DIGESTIVE: "🍽️", // stomach 대체
  PHLEGM_DAMPNESS: "💧", // droplet
  BLOOD_DEFICIENCY: "💓", // heartbeat
  BLOOD_STASIS: "🔄", // activity 대체
};

// 카드7 "생활관리"(공통) 카드 전용 아이콘 — heart 요청, 색상은 중립 회색 지정이라 이모지
// 자체를 회색 하트(🩶)로 골라 별도 색상 처리 없이 요건을 만족시킨다.
export const TCM_LIFESTYLE_ICON = "🩶";

export function tcmCategoryIcon(categoryCode: string): string {
  return TCM_CATEGORY_ICON[categoryCode] ?? "◆";
}
