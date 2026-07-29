import type { Metadata } from "next";
import MissionSubmissionPage from "@/components/MissionSubmissionPage";
import { getMissionOgImagePath } from "@/lib/mission-settings";
import { buildOgMetadata } from "@/lib/og-image";

// OG 이미지 우선순위(task3.md) — 이 페이지는 원래 generateMetadata 자체가 없어서
// 카톡 미리보기가 항상 루트 layout의 공통 로고로만 떴다(전용 이미지 설정 UI/코드 경로
// 자체가 존재하지 않았음 — 캐싱 문제가 아니라 애초에 반영 로직이 없었던 것).
export async function generateMetadata(): Promise<Metadata> {
  const ownImagePath = await getMissionOgImagePath();
  return buildOgMetadata({
    title: "규림한의원 미션톡",
    description: "이번 주 미션을 확인하고 적립금을 받아보세요.",
    ownImagePath,
  });
}

// 미션 제출 공개 페이지(/m/[token], task.md 3-4) — 인증 없음.
export default async function MissionTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <MissionSubmissionPage token={token} />;
}
