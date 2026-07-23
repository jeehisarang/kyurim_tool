import { prisma } from "@/lib/db";

const SETTINGS_ID = 1;

export type TrialCampaignSettingsView = {
  heroImagePath: string | null;
  headline: string | null;
  description: string | null;
};

/**
 * 체험이벤트 캠페인 설정(싱글톤, task.md 1-5). 아직 한 번도 저장 안 됐으면 DB에 행 자체가
 * 없을 수 있어 그 경우 전부 null인 기본값을 반환한다(에러 아님 — 공개 신청페이지가
 * placeholder로 대체 표시).
 */
export async function getTrialCampaignSettings(): Promise<TrialCampaignSettingsView> {
  const row = await prisma.trialCampaignSettings.findUnique({ where: { id: SETTINGS_ID } });
  return {
    heroImagePath: row?.heroImagePath ?? null,
    headline: row?.headline ?? null,
    description: row?.description ?? null,
  };
}

export async function upsertTrialCampaignSettings(input: {
  heroImagePath?: string;
  headline: string;
  description: string;
}): Promise<TrialCampaignSettingsView> {
  const row = await prisma.trialCampaignSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {
      headline: input.headline,
      description: input.description,
      ...(input.heroImagePath ? { heroImagePath: input.heroImagePath } : {}),
    },
    create: {
      id: SETTINGS_ID,
      headline: input.headline,
      description: input.description,
      heroImagePath: input.heroImagePath ?? null,
    },
  });
  return { heroImagePath: row.heroImagePath, headline: row.headline, description: row.description };
}
