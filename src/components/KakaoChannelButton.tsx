"use client";

import { useEffect, useId } from "react";
import { useKakaoSdk } from "@/lib/useKakaoSdk";

const CHANNEL_PUBLIC_ID = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_PUBLIC_ID;

/**
 * 카카오톡 채널 추가 버튼(task.md Phase 4-3) — Kakao.Channel.createAddChannelButton()이
 * container 안에 공식 버튼 이미지를 직접 그려 넣는다. NEXT_PUBLIC_KAKAO_CHANNEL_PUBLIC_ID가
 * 없으면 컨테이너 자체를 렌더링하지 않는다(안전한 폴백).
 */
export default function KakaoChannelButton() {
  const ready = useKakaoSdk();
  // useId()가 반환하는 ":r0:" 형태는 CSS 선택자에 그대로 못 써서 콜론을 제거한다.
  const rawId = useId();
  const containerId = `kakao-channel-btn-${rawId.replace(/:/g, "")}`;

  useEffect(() => {
    if (!ready || !CHANNEL_PUBLIC_ID || !window.Kakao) return;
    window.Kakao.Channel.createAddChannelButton({
      container: `#${containerId}`,
      channelPublicId: CHANNEL_PUBLIC_ID,
    });
  }, [ready, containerId]);

  if (!CHANNEL_PUBLIC_ID) return null;

  return <div id={containerId} />;
}
