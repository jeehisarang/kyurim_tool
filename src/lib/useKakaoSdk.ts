"use client";

import { useEffect, useState } from "react";

// 카카오 JS SDK v2(task.md ⚠️ SDK 버전 주의) — v1(Legacy)은 2026.12.31 지원 종료 예정이라
// 반드시 v2 CDN 경로로 로드한다. 버전은 카카오 다운로드 페이지 기준 2.8.1(2026.4.9 배포)로
// 고정 — latest 별칭이 없어 자동 최신화는 안 되니, 업그레이드 시 이 상수만 갱신하면 된다.
const KAKAO_SDK_VERSION = "2.8.1";
const KAKAO_SDK_SRC = `https://t1.kakaocdn.net/kakao_js_sdk/${KAKAO_SDK_VERSION}/kakao.min.js`;
const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

export type KakaoSdk = {
  init: (key: string) => void;
  isInitialized: () => boolean;
  Share: {
    sendDefault: (options: Record<string, unknown>) => void;
  };
  Channel: {
    createAddChannelButton: (options: { container: string; channelPublicId: string }) => void;
    addChannel: (options: { channelPublicId: string }) => void;
  };
};

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

let loadPromise: Promise<KakaoSdk> | null = null;

// 스크립트 태그를 앱 전체에서 한 번만 삽입하기 위한 모듈 스코프 싱글톤(task.md "공용
// 훅/컴포넌트"). 이 훅을 여러 컴포넌트가 동시에 호출해도(공유버튼+채널버튼 동시 노출 등)
// 실제 <script> 삽입과 Kakao.init()은 최초 1회만 일어난다.
function loadKakaoSdk(jsKey: string): Promise<KakaoSdk> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (window.Kakao) {
      if (!window.Kakao.isInitialized()) window.Kakao.init(jsKey);
      resolve(window.Kakao);
      return;
    }
    const script = document.createElement("script");
    script.src = KAKAO_SDK_SRC;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      if (!window.Kakao) {
        reject(new Error("Kakao SDK 로드 후 window.Kakao를 찾을 수 없습니다."));
        return;
      }
      if (!window.Kakao.isInitialized()) window.Kakao.init(jsKey);
      resolve(window.Kakao);
    };
    script.onerror = () => reject(new Error("Kakao SDK 스크립트 로드에 실패했습니다."));
    document.head.appendChild(script);
  });
  return loadPromise;
}

/**
 * 카카오 JS SDK(v2) 공용 로더(task.md). NEXT_PUBLIC_KAKAO_JS_KEY가 없으면 스크립트 로드
 * 자체를 시도하지 않고 항상 false를 반환 — 호출부(KakaoShareButton/KakaoChannelButton)는
 * 이 값으로 카카오 관련 버튼을 아예 렌더링하지 않는 안전한 폴백을 구현한다.
 */
export function useKakaoSdk(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!KAKAO_JS_KEY) return;
    let cancelled = false;
    loadKakaoSdk(KAKAO_JS_KEY)
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err) => {
        console.error(err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
