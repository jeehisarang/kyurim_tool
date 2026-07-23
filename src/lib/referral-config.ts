// 킬팻캡슐 3일체험 추천 이벤트(task.md) — 확정 숫자는 전부 이 파일에서만 관리한다.
export const TRIAL_REFERRAL_EXPIRY_DAYS = 7;
export const TRIAL_REFERRAL_BONUS_AMOUNT = 5000;
export const MAIN_REFERRAL_BONUS_AMOUNT = 70000;
export const MAIN_REFERRAL_DISCOUNT_AMOUNT = 30000;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function computeTrialReferralExpiry(startDate: Date): Date {
  return addDays(startDate, TRIAL_REFERRAL_EXPIRY_DAYS);
}
