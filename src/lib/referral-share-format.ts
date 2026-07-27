import { getShareBaseUrl } from "@/lib/share-base-url";
import { TRIAL_REFERRAL_BONUS_AMOUNT } from "@/lib/referral-config";

export type ReferralLinkKind = "TRIAL" | "MAIN";

export const REFERRAL_SHARE_LABEL: Record<ReferralLinkKind, string> = {
  TRIAL: "추천링크(체험)",
  MAIN: "추천링크(본프로그램)",
};

// "내 추천 현황" 공개페이지(/refer/my/[token], task.md) — TRIAL/MAIN 둘 다 여기로 통일한다.
// 예전엔 kind별로 /refer/trial 또는 /refer/main(신청폼 자체)을 직접 공유해서, 톡을 받은
// 본인이 확인차 눌러보면 "자기 이름으로 자기가 신청하는" 부자연스러운 화면이 보였다 —
// 이제 이 링크는 항상 "내 현황" 대시보드로 가고, 실제 신청폼 공유는 그 페이지 안의
// 카톡공유 버튼이 담당한다(MyReferralPage.tsx).
export function referralSharePath(_kind: ReferralLinkKind, token: string): string {
  return `/refer/my/${token}`;
}

// 추천링크의 실제 URL만 필요한 호출측(AI 프롬프트에 전달할 "포함할 링크", task.md 재구조화)을
// 위해 분리 — buildReferralShareBlock은 이 함수 위에 고정 안내문구를 덧붙인 것뿐이다.
export function buildReferralShareUrl(kind: ReferralLinkKind, token: string): string {
  return `${getShareBaseUrl()}${referralSharePath(kind, token)}`;
}

/**
 * 톡생성기 "링크 포함하기 > 추천링크" 체크박스(task2.md) 전용 고정 문구 블록. 기존
 * program-events/generate/route.ts에 있던 2일차톡 자동삽입 문구(buildDay2ReferralBlock)를
 * 대체하며, 링크 목적지를 신청폼에서 "내 추천 현황" 페이지로 바꾼 문구로 갱신했다(task.md).
 *
 * TRIAL 문구(task.md 확정본)는 적립금액을 명시한다 — 이 함수는 client/server 양쪽에서
 * import되므로(ShareLinkPanel.tsx는 "use client") prisma에 직접 접근하는 서버 전용
 * getTrialReferralBonusAmount()를 여기서 호출할 수 없다. 그래서 이미 해석된 금액을
 * trialBonusAmount 파라미터로 받는다 — 기본값은 referral-config.ts의 하드코딩 상수라
 * 호출측이 값을 안 넘겨도(설정 로딩 전 등) 항상 정상 동작한다.
 */
export function buildReferralShareBlock(
  kind: ReferralLinkKind,
  token: string,
  trialBonusAmount: number = TRIAL_REFERRAL_BONUS_AMOUNT,
): string {
  const url = buildReferralShareUrl(kind, token);

  if (kind === "MAIN") {
    // MAIN은 소개자 적립금이 본프로그램 기간(1개월/3개월)에 따라 달라져(35,000원/70,000원 등,
    // referral-config.ts MAIN_REFERRAL_DEFAULTS) 공유 시점엔 어느 금액이 적용될지 알 수 없다 —
    // task.md 확인 결과 이 문구에 특정 금액을 명시하지 않는 현재 방식이 맞다(수정 범위 아님).
    return (
      `🎁 킬팻캡슐, 주변에도 추천해보세요!\n` +
      `아래 내 추천페이지에서 링크를 공유하시면, 신청하는 분마다 적립금이 쌓여요.\n\n` +
      `👉 내 추천 현황 보기\n` +
      `${url}`
    );
  }

  // task.md 확정 문구 그대로 — 줄바꿈/이모지까지 정확히 일치시킬 것.
  return (
    `🎁 3일체험, 주변에도 추천해보세요!\n` +
    `아래 내 추천페이지에서 링크를 공유하시면, 친구가 체험을 시작할 때마다 ${trialBonusAmount.toLocaleString()}원씩 적립금이 쌓여요.\n` +
    `🔗 내 추천 현황 보기\n` +
    `${url}`
  );
}
