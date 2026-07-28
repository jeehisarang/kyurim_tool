import MissionSubmissionPage from "@/components/MissionSubmissionPage";

// 미션 제출 공개 페이지(/m/[token], task.md 3-4) — 인증 없음.
export default async function MissionTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <MissionSubmissionPage token={token} />;
}
