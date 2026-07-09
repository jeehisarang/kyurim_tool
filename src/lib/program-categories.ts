// 관리 방식이 동일한 프로그램들을 화면상으로만 묶어 보여주기 위한 카테고리 매핑.
// DB 구조 변경 없음 — Program/Prescription은 여전히 개별 레코드 그대로이며, 이 매핑은
// 순수 표시 레벨(요약카드/필터탭/뱃지)에서만 쓰인다. 새 프로그램을 추가할 때 이 맵에
// 등록하지 않으면 그냥 미분류로 남을 뿐 화면이 깨지지는 않는다.
export type ProgramCategoryKey = "탕약" | "환" | "킬팻캡슐";

export const PROGRAM_CATEGORY_ORDER: ProgramCategoryKey[] = ["탕약", "환", "킬팻캡슐"];

const PROGRAM_CATEGORY_MAP: Record<string, ProgramCategoryKey> = {
  // 감비탕/황제감비탕(제품별 세분화 이전 세대)과 감비탕60포/1개월/3개월·황제1개월/3개월
  // (제품별 세분화 세대, 실사용 이력 없이 곧바로 탕약/환약 공통 기간 티어로 대체됨)은 전부
  // 비활성화(isActive=false)됐지만, 과거 이력이 있는 경우 배지가 계속 정상 표시되도록
  // 매핑은 남겨둔다.
  감비탕: "탕약",
  황제감비탕: "탕약",
  감비탕60포: "탕약",
  감비탕1개월: "탕약",
  감비탕3개월: "탕약",
  황제1개월: "탕약",
  황제3개월: "탕약",
  // 탕약/환약 최종 단순화 — 기간 티어만 남긴 신규 프로그램.
  "60포탕약": "탕약",
  탕약1개월: "탕약",
  탕약3개월: "탕약",
  환1개월: "환",
  환3개월: "환",
  // S환/하비환은 비활성화됐지만 과거 이력 표시를 위해 매핑 유지.
  S환: "환",
  하비환: "환",
  킬캡3체험: "킬팻캡슐",
  킬캡1개월: "킬팻캡슐",
  킬캡3개월: "킬팻캡슐",
};

export function getProgramCategory(programName: string): ProgramCategoryKey | null {
  return PROGRAM_CATEGORY_MAP[programName] ?? null;
}

export const PROGRAM_CATEGORY_ICON: Record<ProgramCategoryKey, string> = {
  탕약: "🍵",
  환: "🟤",
  킬팻캡슐: "💊",
};

// 카테고리 키("환")와 실제 화면 표시 문구("환약")가 다른 경우가 있어(등록 폼 드롭
// 그룹명 등) 별도로 분리해둔다 — 필터탭/통계카드는 기존처럼 "환"을 그대로 쓴다.
export const PROGRAM_CATEGORY_GROUP_LABEL: Record<ProgramCategoryKey, string> = {
  탕약: "탕약",
  환: "환약",
  킬팻캡슐: "킬팻캡슐",
};

// 같은 카테고리 안에서도 세부 프로그램(대분류+기간)이 헷갈리는 문제(예: "킬캡3체험" vs
// "킬캡3개월") 해결용 — 배지를 "[아이콘] 대분류 · 기간" 형식으로 표시하기 위한 매핑.
// tier는 같은 대분류 안에서 기간이 짧을수록 1(연하게), 길수록 커진다(진하게) — 정확한 일수
// 비례가 아니라 이 배열에 나열한 순서(짧다→길다) 기준 명도 단계 지정일 뿐이다.
// 여기 없는 프로그램(예: 비활성화된 감비탕/황제감비탕/S환/하비환 legacy)은 null을 반환하고,
// 호출부는 기존처럼 프로그램명 그대로 + 기간/명도 단계 없이 표시한다.
export type ProgramBadgeInfo = {
  family: string;
  period: string;
  tier: 1 | 2 | 3;
};

const PROGRAM_BADGE_MAP: Record<string, ProgramBadgeInfo> = {
  킬캡3체험: { family: "킬팻캡슐", period: "3일체험", tier: 1 },
  킬캡1개월: { family: "킬팻캡슐", period: "1개월", tier: 2 },
  킬캡3개월: { family: "킬팻캡슐", period: "3개월", tier: 3 },
  "60포탕약": { family: "탕약", period: "60포", tier: 1 },
  탕약1개월: { family: "탕약", period: "1개월", tier: 2 },
  탕약3개월: { family: "탕약", period: "3개월", tier: 3 },
  환1개월: { family: "환약", period: "1개월", tier: 1 },
  환3개월: { family: "환약", period: "3개월", tier: 2 },
};

export function getProgramBadgeInfo(programName: string): ProgramBadgeInfo | null {
  return PROGRAM_BADGE_MAP[programName] ?? null;
}
