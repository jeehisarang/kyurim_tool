import type { Metadata } from "next";
import MyReferralPage from "@/components/MyReferralPage";
import { getTrialCampaignSettings } from "@/lib/trial-campaign";
import { buildOgMetadata } from "@/lib/og-image";

// generateMetadata가 매 요청마다 최신 캠페인 설정을 반영해야 하므로 정적 프리렌더링으로
// 값이 굳지 않게 강제한다(/refer/trial/page.tsx와 동일 이유).
export const dynamic = "force-dynamic";

// OG 이미지 우선순위(task.md) — 이 화면도 킬팻캡슐 체험 캠페인 히어로 이미지를 그대로
// 쓴다(추천링크가 TRIAL/MAIN 어느 kind든 동일 — 공유 대상은 항상 체험 신청 유도이므로
// 링크 kind 조회 없이 캠페인 설정만 본다). 없으면 공통 로고로 폴백.
export async function generateMetadata(): Promise<Metadata> {
  const campaign = await getTrialCampaignSettings();
  return buildOgMetadata({
    title: "내 추천 현황 — 규림한의원 킬팻캡슐 3일체험",
    description: "친구에게 추천하고 적립금을 받아보세요.",
    ownImagePath: campaign.heroImagePath,
  });
}

// "내 추천 현황" 전용 공개페이지(task.md) — 신청폼(/refer/trial/[token])에서 배너를
// 떼어내 여기로 옮겼다. 신청폼은 "친구가 받는 화면", 이 페이지는 "코드 소유자 본인이
// 보는 화면"으로 역할을 완전히 분리한다. generateMetadata를 쓰려면 서버 컴포넌트여야
// 해서(task.md OG 이미지 작업) useParams 대신 params prop으로 token을 받도록 바꿨다.
export default async function ReferMyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <MyReferralPage token={token} />;
}
