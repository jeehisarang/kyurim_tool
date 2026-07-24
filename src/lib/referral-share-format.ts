import { TRIAL_REFERRAL_BONUS_AMOUNT, MAIN_REFERRAL_BONUS_AMOUNT } from "@/lib/referral-config";

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

// TRIAL(체험)/MAIN(본프로그램)에 따라 공개페이지 경로가 다르다 —
// prescriptions/[prescriptionId]/page.tsx의 referralPath와 동일 규칙.
export function referralSharePath(kind: ReferralLinkKind, token: string): string {
  return kind === "MAIN" ? `/refer/main/${token}` : `/refer/trial/${token}`;
}

/**
 * 톡생성기 "링크 포함하기 > 추천링크" 체크박스(task2.md) 전용 고정 문구 블록. 기존
 * program-events/generate/route.ts에 있던 2일차톡 자동삽입 문구(buildDay2ReferralBlock)와
 * 동일한 TRIAL 문구를 그대로 재사용한다 — 그 자동삽입은 이 체크박스 방식으로 대체됐다
 * (task2.md "중복 방지 목적이 아니라 일관성 위해" 2일차톡 기본체크).
 */
export function buildReferralShareBlock(kind: ReferralLinkKind, token: string, expiresAt: Date): string {
  const url = `${shareBaseUrl()}${referralSharePath(kind, token)}`;
  const expiryText = expiresAt.toISOString().slice(0, 10);

  if (kind === "MAIN") {
    return (
      `🎁 킬팻캡슐, 주변에도 추천해보세요!\n` +
      `아래 링크로 신청하시는 분이 생기면 ${MAIN_REFERRAL_BONUS_AMOUNT.toLocaleString()}원 적립해드려요.\n\n` +
      `👉 내 추천링크\n` +
      `${url}\n\n` +
      `(${expiryText}까지 신청 건에 한해 적립됩니다)`
    );
  }

  return (
    `🎁 3일체험, 주변에도 추천해보세요!\n` +
    `아래 링크로 신청하시는 분이 생기면 ${TRIAL_REFERRAL_BONUS_AMOUNT.toLocaleString()}원씩 적립해드려요.\n` +
    `적립금은 나중에 킬팻캡슐 본프로그램 신청하실 때 사용하실 수 있어요.\n\n` +
    `👉 내 추천링크\n` +
    `${url}\n\n` +
    `(${expiryText}까지 신청 건에 한해 적립됩니다)`
  );
}
