import type { Metadata } from "next";
import TrialApplicationForm, { DEFAULT_HEADLINE, DEFAULT_DESCRIPTION } from "@/components/TrialApplicationForm";
import { getTrialCampaignSettings } from "@/lib/trial-campaign";
import { buildOgMetadata } from "@/lib/og-image";

// generateMetadata가 매 요청마다 최신 캠페인 설정을 반영해야 하므로(원장이 아무 때나
// 헤드라인/히어로 이미지를 바꿀 수 있음) 정적 프리렌더링으로 값이 굳지 않게 강제한다.
export const dynamic = "force-dynamic";

// OG 이미지 우선순위(task.md) — 캠페인 히어로 이미지가 있으면 그것, 없으면 공통 로고로
// 폴백(buildOgMetadata가 처리).
export async function generateMetadata(): Promise<Metadata> {
  const campaign = await getTrialCampaignSettings();
  return buildOgMetadata({
    title: campaign.headline || DEFAULT_HEADLINE,
    description: DEFAULT_DESCRIPTION,
    ownImagePath: campaign.heroImagePath,
  });
}

// 원내 QR용(추천코드 없음) — /refer/trial/[token]과 동일 컴포넌트를 token 없이 재사용.
export default function TrialReferralPage() {
  return <TrialApplicationForm />;
}
