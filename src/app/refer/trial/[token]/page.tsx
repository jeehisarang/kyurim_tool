import type { Metadata } from "next";
import TrialApplicationForm, { DEFAULT_HEADLINE, DEFAULT_DESCRIPTION } from "@/components/TrialApplicationForm";
import { getTrialCampaignSettings } from "@/lib/trial-campaign";
import { buildOgMetadata } from "@/lib/og-image";

// generateMetadata가 매 요청마다 최신 캠페인 설정을 반영해야 하므로 정적 프리렌더링으로
// 값이 굳지 않게 강제한다(/refer/trial/page.tsx와 동일 이유).
export const dynamic = "force-dynamic";

// OG 이미지 우선순위(task.md) — /refer/trial과 동일하게 캠페인 히어로 이미지 우선,
// 없으면 공통 로고로 폴백.
export async function generateMetadata(): Promise<Metadata> {
  const campaign = await getTrialCampaignSettings();
  return buildOgMetadata({
    title: campaign.headline || DEFAULT_HEADLINE,
    description: DEFAULT_DESCRIPTION,
    ownImagePath: campaign.heroImagePath,
  });
}

// 추천링크로 진입 — 배지 문구는 서버 조회 없이 URL의 token을 그대로 노출한다("링크
// 소유자 이름은 노출하지 않음, 코드만"이라는 요구사항상 조회할 개인정보가 없다).
// generateMetadata를 쓰려면 서버 컴포넌트여야 해서(task.md OG 이미지 작업) useParams
// 대신 params prop으로 token을 받도록 바꿨다 — 클라이언트 로직 자체는 그대로
// TrialApplicationForm(client component)에 위임.
export default async function TrialReferralWithTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <TrialApplicationForm referralToken={token} />;
}
