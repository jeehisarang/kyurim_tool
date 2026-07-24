"use client";

import styles from "./KakaoShareButton.module.css";
import { useKakaoSdk } from "@/lib/useKakaoSdk";

const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

/**
 * 카카오톡 공유 버튼(task.md Phase 4-2) — Kakao.Share.sendDefault() 호출. imageUrl이 있으면
 * 카드형 feed 템플릿, 없으면 text 템플릿으로 폴백한다(썸네일이 항상 준비돼 있지 않은 화면도
 * 있어서). NEXT_PUBLIC_KAKAO_JS_KEY가 없으면 아예 렌더링하지 않는다(안전한 폴백).
 */
export default function KakaoShareButton({
  title,
  description,
  link,
  imageUrl,
  label = "카카오톡 공유하기",
}: {
  title: string;
  description: string;
  link: string;
  imageUrl?: string;
  label?: string;
}) {
  const ready = useKakaoSdk();

  if (!KAKAO_JS_KEY) return null;

  function handleShare() {
    if (!ready || !window.Kakao) return;
    const template = imageUrl
      ? {
          objectType: "feed",
          content: {
            title,
            description,
            imageUrl,
            link: { mobileWebUrl: link, webUrl: link },
          },
          buttons: [{ title: "자세히 보기", link: { mobileWebUrl: link, webUrl: link } }],
        }
      : {
          objectType: "text",
          text: `${title}\n${description}`,
          link: { mobileWebUrl: link, webUrl: link },
        };
    window.Kakao.Share.sendDefault(template);
  }

  return (
    <button type="button" className={styles.shareButton} onClick={handleShare} disabled={!ready}>
      {label}
    </button>
  );
}
