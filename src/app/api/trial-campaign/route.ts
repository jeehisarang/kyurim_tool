import { NextResponse } from "next/server";
import { getTrialCampaignSettings, upsertTrialCampaignSettings } from "@/lib/trial-campaign";
import { saveTrialCampaignHeroImage, ImageResizeError } from "@/lib/image-upload";
import { isDirector } from "@/lib/staff-auth";

// 공개 신청페이지가 히어로 이미지/문구를 읽어오는 용도 — 인증 없음.
export async function GET() {
  const settings = await getTrialCampaignSettings();
  return NextResponse.json(settings);
}

// /settings/trial-campaign 저장 — 원장 전용(/api/programs와 동일한 staffUserId+isDirector 패턴).
export async function POST(request: Request) {
  const formData = await request.formData();
  const staffUserId = Number(formData.get("staffUserId"));
  if (!staffUserId || !(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 캠페인 설정을 저장할 수 있습니다." }, { status: 403 });
  }

  const headline = String(formData.get("headline") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const heroImage = formData.get("heroImage");

  let heroImagePath: string | undefined;
  if (heroImage instanceof File && heroImage.size > 0) {
    try {
      heroImagePath = (await saveTrialCampaignHeroImage(heroImage)).path;
    } catch (err) {
      if (err instanceof ImageResizeError) {
        return NextResponse.json({ error: err.message }, { status: 422 });
      }
      throw err;
    }
  }

  // 본프로그램 추천 적립금 설정(task.md 1-2) — 비워두면 null로 저장(기본값 폴백,
  // getMainReferralAmounts 참고). 하드코딩 금지 요구사항의 저장 지점.
  function parseAmountField(key: string): number | null {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
  }

  const settings = await upsertTrialCampaignSettings({
    headline,
    description,
    heroImagePath,
    mainReferrerAmount1mo: parseAmountField("mainReferrerAmount1mo"),
    mainRefereeAmount1mo: parseAmountField("mainRefereeAmount1mo"),
    mainReferrerAmount3mo: parseAmountField("mainReferrerAmount3mo"),
    mainRefereeAmount3mo: parseAmountField("mainRefereeAmount3mo"),
  });
  return NextResponse.json(settings);
}
