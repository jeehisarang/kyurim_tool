import { prisma } from "@/lib/db";

export const DIRECTOR_ROLE = "원장";

// 완벽한 인증이 아니라 실수 방지 목적의 가벼운 서버단 재검증 — Sidebar.tsx의 설정 메뉴
// 노출 조건과 동일한 신뢰 모델(로그인 시스템 없이 "현재 사용자" 선택만 존재).
export async function isDirector(staffUserId: number): Promise<boolean> {
  const staff = await prisma.staffUser.findUnique({ where: { id: staffUserId } });
  return staff?.role === DIRECTOR_ROLE;
}
