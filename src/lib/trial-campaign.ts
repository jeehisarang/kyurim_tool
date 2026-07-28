import { prisma } from "@/lib/db";
import {
  MAIN_REFERRAL_DEFAULTS,
  TRIAL_REFERRAL_BONUS_AMOUNT,
  EXIT_SURVEY_COMPLETION_AMOUNT_DEFAULT,
  type MainProgramDurationTier,
} from "@/lib/referral-config";

const SETTINGS_ID = 1;

export type TrialCampaignSettingsView = {
  heroImagePath: string | null;
  headline: string | null;
  description: string | null;
  mainReferrerAmount1mo: number | null;
  mainRefereeAmount1mo: number | null;
  mainReferrerAmount3mo: number | null;
  mainRefereeAmount3mo: number | null;
  trialReferralBonusAmount: number | null;
  exitSurveyCompletionAmount: number | null;
};

/**
 * 체험이벤트 캠페인 설정(싱글톤, task.md 1-5). 아직 한 번도 저장 안 됐으면 DB에 행 자체가
 * 없을 수 있어 그 경우 전부 null인 기본값을 반환한다(에러 아님 — 공개 신청페이지가
 * placeholder로 대체 표시).
 */
export async function getTrialCampaignSettings(): Promise<TrialCampaignSettingsView> {
  const row = await prisma.trialCampaignSettings.findUnique({ where: { id: SETTINGS_ID } });
  return {
    heroImagePath: row?.heroImagePath ?? null,
    headline: row?.headline ?? null,
    description: row?.description ?? null,
    mainReferrerAmount1mo: row?.mainReferrerAmount1mo ?? null,
    mainRefereeAmount1mo: row?.mainRefereeAmount1mo ?? null,
    mainReferrerAmount3mo: row?.mainReferrerAmount3mo ?? null,
    mainRefereeAmount3mo: row?.mainRefereeAmount3mo ?? null,
    trialReferralBonusAmount: row?.trialReferralBonusAmount ?? null,
    exitSurveyCompletionAmount: row?.exitSurveyCompletionAmount ?? null,
  };
}

export async function upsertTrialCampaignSettings(input: {
  heroImagePath?: string;
  headline: string;
  description: string;
  mainReferrerAmount1mo?: number | null;
  mainRefereeAmount1mo?: number | null;
  mainReferrerAmount3mo?: number | null;
  mainRefereeAmount3mo?: number | null;
  trialReferralBonusAmount?: number | null;
  exitSurveyCompletionAmount?: number | null;
}): Promise<TrialCampaignSettingsView> {
  const amountFields = {
    mainReferrerAmount1mo: input.mainReferrerAmount1mo ?? null,
    mainRefereeAmount1mo: input.mainRefereeAmount1mo ?? null,
    mainReferrerAmount3mo: input.mainReferrerAmount3mo ?? null,
    mainRefereeAmount3mo: input.mainRefereeAmount3mo ?? null,
    trialReferralBonusAmount: input.trialReferralBonusAmount ?? null,
    exitSurveyCompletionAmount: input.exitSurveyCompletionAmount ?? null,
  };
  const row = await prisma.trialCampaignSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {
      headline: input.headline,
      description: input.description,
      ...(input.heroImagePath ? { heroImagePath: input.heroImagePath } : {}),
      ...amountFields,
    },
    create: {
      id: SETTINGS_ID,
      headline: input.headline,
      description: input.description,
      heroImagePath: input.heroImagePath ?? null,
      ...amountFields,
    },
  });
  return {
    heroImagePath: row.heroImagePath,
    headline: row.headline,
    description: row.description,
    mainReferrerAmount1mo: row.mainReferrerAmount1mo,
    mainRefereeAmount1mo: row.mainRefereeAmount1mo,
    mainReferrerAmount3mo: row.mainReferrerAmount3mo,
    mainRefereeAmount3mo: row.mainRefereeAmount3mo,
    trialReferralBonusAmount: row.trialReferralBonusAmount,
    exitSurveyCompletionAmount: row.exitSurveyCompletionAmount,
  };
}

/**
 * 체험(TRIAL) 추천 공유 문구/실제 적립 지급 양쪽이 공유하는 단일 소스(task.md) —
 * getMainReferralAmounts와 동일한 원칙. 설정값이 없으면 referral-config.ts의
 * TRIAL_REFERRAL_BONUS_AMOUNT(5,000원)로 폴백한다.
 */
export async function getTrialReferralBonusAmount(): Promise<number> {
  const settings = await getTrialCampaignSettings();
  return settings.trialReferralBonusAmount ?? TRIAL_REFERRAL_BONUS_AMOUNT;
}

export type MainReferralAmounts = { referrerAmount: number; refereeAmount: number };

/**
 * 본프로그램 추천 적립금 설정값 조회(task.md 1-2) — TrialCampaignSettings에 원장이 설정한
 * 값이 있으면 그걸, 없으면(row 자체가 없거나 해당 필드만 비어있으면) referral-config.ts의
 * 기본값으로 폴백한다. 하드코딩 금지 요구사항의 실제 적용 지점 — confirmMainReferral(적립
 * 생성)과 랜딩페이지 할인 문구 양쪽이 이 함수 하나를 공유해서 항상 같은 값을 본다.
 */
export async function getMainReferralAmounts(tier: MainProgramDurationTier): Promise<MainReferralAmounts> {
  const settings = await getTrialCampaignSettings();
  const defaults = MAIN_REFERRAL_DEFAULTS[tier];
  if (tier === "ONE_MONTH") {
    return {
      referrerAmount: settings.mainReferrerAmount1mo ?? defaults.referrerAmount,
      refereeAmount: settings.mainRefereeAmount1mo ?? defaults.refereeAmount,
    };
  }
  return {
    referrerAmount: settings.mainReferrerAmount3mo ?? defaults.referrerAmount,
    refereeAmount: settings.mainRefereeAmount3mo ?? defaults.refereeAmount,
  };
}

/**
 * 마감설문 작성 완료 적립금(task2.md) — 마감설문 완료 처리(exit-surveys.ts
 * createExitSurveyResponse)와 완료 화면 안내 문구(ExitSurveyForm.tsx) 양쪽이 이 함수 하나를
 * 공유해서 항상 같은 값을 본다(getTrialReferralBonusAmount와 동일 원칙).
 */
export async function getExitSurveyCompletionAmount(): Promise<number> {
  const settings = await getTrialCampaignSettings();
  return settings.exitSurveyCompletionAmount ?? EXIT_SURVEY_COMPLETION_AMOUNT_DEFAULT;
}
