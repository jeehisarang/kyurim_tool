"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * "톡생성기"가 "AI 생성"(/ai-studio) 안 "톡 생성" 탭으로 이동했다 — 기존 /messages
 * 북마크/하드코딩된 링크가 깨지지 않도록 쿼리스트링을 그대로 유지한 채 리다이렉트만 한다.
 * 실제 기능은 src/components/TalkStudioPanel.tsx로 이전됨.
 */
export default function MessagesRedirectPage() {
  return (
    <Suspense fallback={null}>
      <MessagesRedirect />
    </Suspense>
  );
}

function MessagesRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "talk");
    router.replace(`/ai-studio?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
