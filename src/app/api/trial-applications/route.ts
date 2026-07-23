import { NextResponse } from "next/server";
import { createTrialApplication, listUnconvertedTrialApplications } from "@/lib/referrals";

const REQUIRED_TEXT_FIELDS = ["name", "phone"] as const;
const REQUIRED_BODY_TYPE_FIELDS = [
  "bodyType1",
  "bodyType2",
  "bodyType3",
  "bodyType4",
  "bodyType5",
  "bodyType6",
] as const;
const OPTIONAL_TEXT_FIELDS = [
  "heightWeight",
  "weightGoalKg",
  "weightChange6mo",
  "currentMeds",
  "pastHistory",
  "familyHistory",
  "dietExperience",
  "bodyType1Other",
  "bodyType2Other",
  "bodyType3Other",
  "bodyType4Other",
  "bodyType5Other",
  "bodyType6Other",
  "referralToken",
] as const;

// 직원용 목록(/prescriptions/new "체험신청에서 가져오기" 피커) — 미전환분만.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("unconverted") !== "1") {
    return NextResponse.json({ error: "지원하지 않는 조회입니다." }, { status: 400 });
  }
  const applications = await listUnconvertedTrialApplications();
  return NextResponse.json(applications);
}

// 공개 신청페이지(/refer/trial[/token]) 제출 — 인증 없음.
export async function POST(request: Request) {
  const body = await request.json();

  for (const field of [...REQUIRED_TEXT_FIELDS, ...REQUIRED_BODY_TYPE_FIELDS]) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      return NextResponse.json({ error: "필수 항목을 모두 입력해주세요." }, { status: 400 });
    }
  }

  const input: Record<string, string> = {
    name: body.name.trim(),
    phone: body.phone.trim(),
    bodyType1: body.bodyType1,
    bodyType2: body.bodyType2,
    bodyType3: body.bodyType3,
    bodyType4: body.bodyType4,
    bodyType5: body.bodyType5,
    bodyType6: body.bodyType6,
  };
  for (const field of OPTIONAL_TEXT_FIELDS) {
    if (typeof body[field] === "string" && body[field].trim()) {
      input[field] = body[field].trim();
    }
  }

  const application = await createTrialApplication(
    input as Parameters<typeof createTrialApplication>[0],
  );
  return NextResponse.json({ id: application.id }, { status: 201 });
}
