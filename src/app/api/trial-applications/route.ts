import { NextResponse } from "next/server";
import {
  createTrialApplication,
  listUnconvertedTrialApplications,
  listAllTrialApplications,
  InvalidBodyTypeSelectionError,
  type TrialApplicationInput,
} from "@/lib/referrals";
import { BODY_TYPE_MAX_SELECTIONS } from "@/lib/trial-application-format";

const REQUIRED_TEXT_FIELDS = ["name", "phone"] as const;
const BODY_TYPE_FIELDS = ["bodyType1", "bodyType2", "bodyType3", "bodyType4", "bodyType5", "bodyType6"] as const;
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

// 직원용 목록 — unconverted=1이면 미전환분만(/prescriptions/new 피커),
// 없으면 전체(/refer/applications 응답 전체보기, task.md 보완 1항).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const applications =
    searchParams.get("unconverted") === "1"
      ? await listUnconvertedTrialApplications()
      : await listAllTrialApplications();
  return NextResponse.json(applications);
}

// 공개 신청페이지(/refer/trial[/token]) 제출 — 인증 없음.
export async function POST(request: Request) {
  const body = await request.json();

  for (const field of REQUIRED_TEXT_FIELDS) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      return NextResponse.json({ error: "필수 항목을 모두 입력해주세요." }, { status: 400 });
    }
  }
  for (const field of BODY_TYPE_FIELDS) {
    const values = body[field];
    if (!Array.isArray(values) || values.length < 1 || values.length > BODY_TYPE_MAX_SELECTIONS) {
      return NextResponse.json(
        { error: `몸타입 문항은 1~${BODY_TYPE_MAX_SELECTIONS}개까지 선택해야 합니다.` },
        { status: 400 },
      );
    }
  }

  const input: Record<string, unknown> = {
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

  try {
    const application = await createTrialApplication(input as TrialApplicationInput);
    return NextResponse.json({ id: application.id }, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidBodyTypeSelectionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
