import type { Metadata } from "next";
import { getShareBaseUrl } from "@/lib/share-base-url";

// 규림한의원 공통 기본 공유 이미지(로고, task.md) — 페이지에 자체 히어로 이미지가 없을 때
// og:image 최종 폴백으로 쓰는 정적 자산. OG 표준 비율(1200x630)로 미리 리사이즈해 저장했다.
export const DEFAULT_OG_IMAGE_PATH = "/og/gyurim-default.jpg";

/**
 * 공개 페이지 og:image 우선순위(task.md) 판단을 한 곳에 모은 헬퍼 — 페이지가 자체 히어로
 * 이미지(ownImagePath, 예: TrialCampaignSettings.heroImagePath, EventImage.compositeImagePath)를
 * 가지고 있으면 그것을, 없으면 공통 로고 이미지를 절대 URL로 반환한다. 카카오 등 외부
 * 크롤러가 접근해야 하므로 항상 getShareBaseUrl() 기준으로 절대화한다(로컬 LAN 주소/상대
 * 경로 금지 — share-base-url.ts와 동일 원칙).
 */
export function resolveOgImageUrl(ownImagePath?: string | null): string {
  return `${getShareBaseUrl()}${ownImagePath || DEFAULT_OG_IMAGE_PATH}`;
}

/**
 * generateMetadata에서 그대로 반환할 수 있는 완성된 Metadata 객체를 만든다. Next.js는
 * openGraph를 상위 layout과 필드 단위로 병합하지 않고 통째로 대체하므로, 매번 title/
 * description/images를 전부 채워서 반환한다(상위 layout의 부분 상속에 기대지 않음).
 */
export function buildOgMetadata(input: {
  title: string;
  description: string;
  ownImagePath?: string | null;
}): Metadata {
  const imageUrl = resolveOgImageUrl(input.ownImagePath);
  return {
    title: input.title,
    description: input.description,
    openGraph: {
      title: input.title,
      description: input.description,
      images: [{ url: imageUrl, width: 1200, height: 630 }],
    },
  };
}
