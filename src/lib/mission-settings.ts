import { prisma } from "@/lib/db";

const SETTINGS_ID = 1;

/**
 * 미션톡 전용 설정(싱글톤, task3.md) — 아직 한 번도 저장 안 됐으면 DB에 행 자체가 없을 수
 * 있어 그 경우 null을 반환한다(에러 아님 — og-image.ts가 공통 로고로 폴백).
 */
export async function getMissionOgImagePath(): Promise<string | null> {
  const row = await prisma.missionSettings.findUnique({ where: { id: SETTINGS_ID } });
  return row?.ogImagePath ?? null;
}

export async function setMissionOgImagePath(ogImagePath: string): Promise<void> {
  await prisma.missionSettings.upsert({
    where: { id: SETTINGS_ID },
    update: { ogImagePath },
    create: { id: SETTINGS_ID, ogImagePath },
  });
}
