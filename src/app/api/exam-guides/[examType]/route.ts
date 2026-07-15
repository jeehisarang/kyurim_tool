import { NextResponse } from "next/server";
import { getExamAcademicGuide, upsertExamAcademicGuide } from "@/lib/exam-academic-guide";
import { isDirector } from "@/lib/staff-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ examType: string }> }) {
  const { examType } = await params;
  const guide = await getExamAcademicGuide(examType);
  return NextResponse.json(guide);
}

// 원장 전용(programs PATCH와 동일한 서버단 재검증 패턴) — 학술 근거는 AI 해설 생성의
// 입력재료라 잘못된 내용이 들어가면 그대로 환자에게 노출될 수 있어 원장만 수정 가능.
export async function PATCH(request: Request, { params }: { params: Promise<{ examType: string }> }) {
  const { examType } = await params;
  const body = await request.json();

  const staffUserId = Number(body.staffUserId);
  if (!staffUserId || !(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 학술 근거를 수정할 수 있습니다." }, { status: 403 });
  }

  const content = typeof body.content === "string" ? body.content : "";

  let tcmPatternMapJson: string | null | undefined;
  if (body.tcmPatternMap !== undefined) {
    if (!Array.isArray(body.tcmPatternMap)) {
      return NextResponse.json({ error: "한의학적 매핑표 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const valid = body.tcmPatternMap.every(
      (e: unknown) =>
        e !== null &&
        typeof e === "object" &&
        typeof (e as Record<string, unknown>).symptoms === "string" &&
        typeof (e as Record<string, unknown>).pattern === "string" &&
        typeof (e as Record<string, unknown>).phrase === "string",
    );
    if (!valid) {
      return NextResponse.json(
        { error: "한의학적 매핑표는 symptoms/pattern/phrase를 모두 채워야 합니다." },
        { status: 400 },
      );
    }
    tcmPatternMapJson = body.tcmPatternMap.length > 0 ? JSON.stringify(body.tcmPatternMap) : null;
  }

  const guide = await upsertExamAcademicGuide(examType, content, tcmPatternMapJson);
  return NextResponse.json(guide);
}
