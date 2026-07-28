// 킬팻캡슐 3일체험 추천 이벤트(task.md) — 확정 숫자는 전부 이 파일에서만 관리한다.
export const TRIAL_REFERRAL_EXPIRY_DAYS = 7;
export const TRIAL_REFERRAL_BONUS_AMOUNT = 5000;

// 본프로그램 추천 적립금 차등화(task.md 추천 이벤트 개선) — 1개월/3개월 프로그램별로
// 소개자/피소개자 금액이 다르다. TrialCampaignSettings에 원장이 조정한 값이 있으면 그걸,
// 없으면 이 기본값을 쓴다(getMainReferralAmounts, trial-campaign.ts).
export const MAIN_REFERRAL_DEFAULTS = {
  ONE_MONTH: { referrerAmount: 35000, refereeAmount: 15000 },
  THREE_MONTH: { referrerAmount: 70000, refereeAmount: 30000 },
} as const;

export type MainProgramDurationTier = "ONE_MONTH" | "THREE_MONTH";

// 마감설문 작성 완료 적립금(task2.md) — TrialCampaignSettings에 원장이 조정한 값이 있으면
// 그걸, 없으면 이 기본값으로 폴백한다(getExitSurveyCompletionAmount, trial-campaign.ts).
export const EXIT_SURVEY_COMPLETION_AMOUNT_DEFAULT = 30000;

// 본프로그램 처방 기간(1개월=30일/3개월=90일)으로 적립금 등급을 구분한다(task.md). 현재
// 활성 프로그램은 이 두 값만 존재하지만, 향후 다른 기간이 추가돼도 안전하도록 30일 이하만
// ONE_MONTH로 판정하고 나머지는 전부 THREE_MONTH로 취급한다.
export function getMainProgramDurationTier(totalDurationDays: number): MainProgramDurationTier {
  return totalDurationDays <= 30 ? "ONE_MONTH" : "THREE_MONTH";
}

// 링크 승격(TRIAL→MAIN, task.md 2) 만료일 — 처방 종료예정일이 아니라 "승격 시점부터" 고정
// 개월 수. 기간이 아직 확정되지 않아 상수로 분리해 추후 조정 가능하게 한다.
export const MAIN_LINK_PROMOTION_EXPIRY_MONTHS: Record<MainProgramDurationTier, number> = {
  ONE_MONTH: 3,
  THREE_MONTH: 6,
};

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function computeTrialReferralExpiry(startDate: Date): Date {
  return addDays(startDate, TRIAL_REFERRAL_EXPIRY_DAYS);
}

export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

// 추천 크레딧(ReferralCreditEntry) 적립 유효기간(task.md) — 1년. 이 지시서 반영일 이후
// CONFIRMED로 전환되는 신규 항목에만 적용하고(confirmReferralCreditEntry,
// linkTrialApplicationToPrescription), 기존에 이미 CONFIRMED였던 항목은 절대 소급 변경하지
// 않는다(그대로 expiresAt=null 유지). 미션톡(MISSION_QUIZ/PHOTO/TEXT) 크레딧과 마찬가지로
// getPatientCreditBalance/listReferralCreditSummary의 동일한 "null=무기한, 값 있으면 그
// 날짜까지" 필터 로직을 그대로 재사용한다(별도 분기 없음).
export const REFERRAL_CREDIT_EXPIRY_YEARS = 1;

export function computeReferralCreditExpiry(confirmedAt: Date): Date {
  return addYears(confirmedAt, REFERRAL_CREDIT_EXPIRY_YEARS);
}

// MAIN 등급 링크(승격이든 신규 발급이든) 만료일 — 지금 시점 기준 +3개월/+6개월(task.md 2).
export function computePromotedLinkExpiry(now: Date, tier: MainProgramDurationTier): Date {
  return addMonths(now, MAIN_LINK_PROMOTION_EXPIRY_MONTHS[tier]);
}
