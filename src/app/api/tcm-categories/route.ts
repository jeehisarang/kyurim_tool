import { NextResponse } from "next/server";
import { listCategoriesForAdmin, updateCategoryTreatmentPrinciple } from "@/lib/tcm-checklist";
import { isDirector } from "@/lib/staff-auth";

// 증상 패턴 프로필(task.md) 관리자 화면(/settings/exam-guides 확장) 전용 — 카테고리명/문항
// 문구는 이번 라운드 수정 대상이 아니라(task.md가 확정한 문구, 임의 수정 금지) 조회만 되고,
// 원장이 편집 가능한 값은 treatmentPrinciple 하나뿐이다.
export async function GET() {
  const categories = await listCategoriesForAdmin();
  return NextResponse.json(categories);
}

// 원장 전용 — /api/exam-guides/[examType] PATCH와 동일한 서버단 재검증 패턴.
export async function PATCH(request: Request) {
  const body = await request.json();

  const staffUserId = Number(body.staffUserId);
  if (!staffUserId || !(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 치료원칙을 수정할 수 있습니다." }, { status: 403 });
  }

  if (!Array.isArray(body.categories)) {
    return NextResponse.json({ error: "categories 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const valid = body.categories.every(
    (c: unknown) =>
      c !== null &&
      typeof c === "object" &&
      typeof (c as Record<string, unknown>).id === "number" &&
      (typeof (c as Record<string, unknown>).treatmentPrinciple === "string" ||
        (c as Record<string, unknown>).treatmentPrinciple === null),
  );
  if (!valid) {
    return NextResponse.json({ error: "categories의 id/treatmentPrinciple 형식이 올바르지 않습니다." }, { status: 400 });
  }

  for (const c of body.categories as { id: number; treatmentPrinciple: string | null }[]) {
    await updateCategoryTreatmentPrinciple(c.id, c.treatmentPrinciple);
  }

  const categories = await listCategoriesForAdmin();
  return NextResponse.json(categories);
}
