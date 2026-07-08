// 관리 방식이 동일한 프로그램들을 화면상으로만 묶어 보여주기 위한 카테고리 매핑.
// DB 구조 변경 없음 — Program/Prescription은 여전히 개별 레코드 그대로이며, 이 매핑은
// 순수 표시 레벨(요약카드/필터탭/뱃지)에서만 쓰인다. 새 프로그램을 추가할 때 이 맵에
// 등록하지 않으면 그냥 미분류로 남을 뿐 화면이 깨지지는 않는다.
export type ProgramCategoryKey = "탕약" | "환" | "킬팻캡슐";

export const PROGRAM_CATEGORY_ORDER: ProgramCategoryKey[] = ["탕약", "환", "킬팻캡슐"];

const PROGRAM_CATEGORY_MAP: Record<string, ProgramCategoryKey> = {
  감비탕: "탕약",
  황제감비탕: "탕약",
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
