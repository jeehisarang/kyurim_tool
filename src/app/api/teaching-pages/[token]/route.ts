import { NextResponse } from "next/server";
import { getPublicTeachingPageByToken, updateTeachingPageContent } from "@/lib/teaching-pages";

// 인증 없는 공개 엔드포인트(/p/{token} 전용) — getPublicTeachingPageByToken 자체가
// 화이트리스트 변환이라 내부 필드가 새어나갈 수 없다.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getPublicTeachingPageByToken(token);
  if (!view) {
    return NextResponse.json({ error: "티칭지를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(view);
}

// 5필드 수작업 편집(생성 직후 화면의 "수정" 버튼) — 단순 마케팅 카피 수정이라 역할 제한
// 없음(work-tasks 수정과 동일 원칙). 수정 이력은 남기지 않고 현재 상태를 덮어쓴다.
export async function PATCH(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json();
  const { headline, personalSubtopic, bodyText, examSummary, academicHook } = body;

  if (
    typeof headline !== "string" ||
    !headline.trim() ||
    typeof personalSubtopic !== "string" ||
    !personalSubtopic.trim() ||
    typeof bodyText !== "string" ||
    !bodyText.trim() ||
    typeof academicHook !== "string" ||
    !academicHook.trim()
  ) {
    return NextResponse.json(
      { error: "headline/personalSubtopic/bodyText/academicHook을 모두 입력하세요." },
      { status: 400 },
    );
  }

  try {
    const updated = await updateTeachingPageContent(token, {
      headline: headline.trim(),
      personalSubtopic: personalSubtopic.trim(),
      bodyText: bodyText.trim(),
      examSummary: typeof examSummary === "string" ? examSummary.trim() : undefined,
      academicHook: academicHook.trim(),
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "티칭지를 찾을 수 없습니다." }, { status: 404 });
  }
}
