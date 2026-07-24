export type ReferralLinkKind = "TRIAL" | "MAIN";

export const REFERRAL_SHARE_LABEL: Record<ReferralLinkKind, string> = {
  TRIAL: "추천링크(체험)",
  MAIN: "추천링크(본프로그램)",
};

function shareBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SHARE_BASE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "https://link.kyurim.kr")
  );
}

// "내 추천 현황" 공개페이지(/refer/my/[token], task.md) — TRIAL/MAIN 둘 다 여기로 통일한다.
// 예전엔 kind별로 /refer/trial 또는 /refer/main(신청폼 자체)을 직접 공유해서, 톡을 받은
// 본인이 확인차 눌러보면 "자기 이름으로 자기가 신청하는" 부자연스러운 화면이 보였다 —
// 이제 이 링크는 항상 "내 현황" 대시보드로 가고, 실제 신청폼 공유는 그 페이지 안의
// 카톡공유 버튼이 담당한다(MyReferralPage.tsx).
export function referralSharePath(_kind: ReferralLinkKind, token: string): string {
  return `/refer/my/${token}`;
}

/**
 * 톡생성기 "링크 포함하기 > 추천링크" 체크박스(task2.md) 전용 고정 문구 블록. 기존
 * program-events/generate/route.ts에 있던 2일차톡 자동삽입 문구(buildDay2ReferralBlock)를
 * 대체하며, 링크 목적지를 신청폼에서 "내 추천 현황" 페이지로 바꾼 문구로 갱신했다(task.md).
 */
export function buildReferralShareBlock(kind: ReferralLinkKind, token: string): string {
  const url = `${shareBaseUrl()}${referralSharePath(kind, token)}`;
  const headline = kind === "MAIN" ? "🎁 킬팻캡슐, 주변에도 추천해보세요!" : "🎁 3일체험, 주변에도 추천해보세요!";

  return (
    `${headline}\n` +
    `아래 내 추천페이지에서 링크를 공유하시면, 신청하는 분마다 적립금이 쌓여요.\n\n` +
    `👉 내 추천 현황 보기\n` +
    `${url}`
  );
}
