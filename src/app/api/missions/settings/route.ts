import { NextResponse } from "next/server";
import { getMissionOgImagePath, setMissionOgImagePath } from "@/lib/mission-settings";
import { saveMissionOgImage, ImageResizeError } from "@/lib/image-upload";
import { isDirector } from "@/lib/staff-auth";

// 미션톡 전용 OG 이미지 설정(task3.md) — /settings/missions 전용, 공개 페이지가 참고.
export async function GET() {
  const ogImagePath = await getMissionOgImagePath();
  return NextResponse.json({ ogImagePath });
}

// 원장 전용(/api/trial-campaign과 동일한 staffUserId+isDirector 패턴).
export async function POST(request: Request) {
  const formData = await request.formData();
  const staffUserId = Number(formData.get("staffUserId"));
  if (!staffUserId || !(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 설정을 저장할 수 있습니다." }, { status: 403 });
  }

  const ogImage = formData.get("ogImage");
  if (!(ogImage instanceof File) || ogImage.size === 0) {
    return NextResponse.json({ error: "이미지 파일을 선택하세요." }, { status: 400 });
  }

  try {
    const { path: ogImagePath } = await saveMissionOgImage(ogImage);
    await setMissionOgImagePath(ogImagePath);
    return NextResponse.json({ ogImagePath });
  } catch (err) {
    if (err instanceof ImageResizeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
