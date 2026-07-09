import CategoryBadge from "@/components/CategoryBadge";
import { getProgramBadgeInfo, getProgramCategory, PROGRAM_CATEGORY_ICON } from "@/lib/program-categories";

/**
 * Program(id/name)을 받아 카테고리 톤+아이콘+"제품군 · 기간" 표시를 전부 계산해주는
 * 공용 래퍼 — /prescriptions 목록, TodoTaskTable(홈/오늘할일), 처방 등록 폼/성공 배너 등
 * 프로그램 배지가 쓰이는 모든 곳이 이 컴포넌트 하나만 쓰면 표시 규칙이 항상 동기화된다.
 * getProgramBadgeInfo에 없는 프로그램(예: 비활성화된 레거시 감비탕/황제감비탕)은 기간/명도
 * 단계 없이 기존처럼 프로그램명 그대로 표시된다.
 */
export default function ProgramBadge({
  id,
  name,
  truncate,
  onClick,
}: {
  id: number;
  name: string;
  truncate?: boolean;
  onClick?: () => void;
}) {
  const category = getProgramCategory(name);
  const badgeInfo = getProgramBadgeInfo(name);
  return (
    <CategoryBadge
      id={id}
      name={badgeInfo?.family ?? name}
      truncate={truncate}
      onClick={onClick}
      categoryKey={category ?? undefined}
      icon={category ? PROGRAM_CATEGORY_ICON[category] : undefined}
      period={badgeInfo?.period}
      tier={badgeInfo?.tier}
    />
  );
}
