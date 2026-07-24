import type { Metadata } from "next";
import ShareLinkPublicPage from "@/components/ShareLinkPublicPage";
import { getShareLinkOgImagePath } from "@/lib/share-links";
import { buildOgMetadata } from "@/lib/og-image";

// OG 이미지 우선순위(task.md) — 이 링크가 이벤트 섹션(EventImage)을 포함하면 그 합성
// 이미지를 자체 히어로 이미지로 쓰고, 없으면(프로그램티칭/검사톡만 있는 링크) 공통
// 로고로 폴백한다. 조회수 증가 등 부수효과가 있는 getShareLinkByToken을 여기서 재사용하면
// 메타데이터 생성 때마다 조회수가 부풀려질 수 있어 순수 조회 함수를 따로 쓴다.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const ownImagePath = await getShareLinkOgImagePath(token);
  return buildOgMetadata({
    title: "규림한의원",
    description: "규림한의원에서 보내드린 맞춤 안내를 확인해보세요.",
    ownImagePath,
  });
}

// 환자별 통합 공유링크(14-11) 공개 페이지. generateMetadata를 쓰려면 서버 컴포넌트여야
// 해서(task.md OG 이미지 작업) 실제 화면 로직은 클라이언트 컴포넌트(ShareLinkPublicPage)로
// 옮기고 이 파일은 token만 넘겨주는 얇은 서버 래퍼로 바꿨다.
export default async function ShareLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareLinkPublicPage token={token} />;
}
