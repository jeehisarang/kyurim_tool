import type { Metadata } from "next";
import TrialApplicationForm, { DEFAULT_HEADLINE, DEFAULT_DESCRIPTION } from "@/components/TrialApplicationForm";
import MainTierLandingChoice from "@/components/MainTierLandingChoice";
import { getTrialCampaignSettings, getMainReferralAmounts } from "@/lib/trial-campaign";
import { getReferralLinkTierByToken } from "@/lib/referrals";
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
//
// 랜딩페이지 분기(task.md 추천 이벤트 개선 3) — 이 토큰의 tier(=ReferralLink.kind)가
// MAIN이면(본프로그램 등록 후 승격된 링크) 기존 체험 신청 폼 대신 "체험 vs 바로등록"
// 선택 화면을 보여준다. TRIAL이거나 매칭되는 링크가 없으면(예: 아직 승격 전) 기존 그대로.
export default async function TrialReferralWithTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tier = await getReferralLinkTierByToken(token);

  if (tier === "MAIN") {
    const [oneMonth, threeMonth] = await Promise.all([
      getMainReferralAmounts("ONE_MONTH"),
      getMainReferralAmounts("THREE_MONTH"),
    ]);
    return (
      <MainTierLandingChoice
        token={token}
        refereeDiscounts={{ oneMonth: oneMonth.refereeAmount, threeMonth: threeMonth.refereeAmount }}
      />
    );
  }

  return <TrialApplicationForm referralToken={token} />;
}
