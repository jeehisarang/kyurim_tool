import { NextResponse } from "next/server";
import {
  createProgramTeaching,
  isLinkedTestType,
  listActiveProgramTeachings,
  listProgramTeachings,
  readContentFieldsFromFormData,
} from "@/lib/program-teaching";
import { saveResizedImage } from "@/lib/image-upload";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("activeOnly") === "1";
  const rows = activeOnly ? await listActiveProgramTeachings() : await listProgramTeachings();
  return NextResponse.json(rows);
}

// 셀링포인트 7개/학술 3개는 전부 nullable — 협업 입력이라 역할 제한 없이 직원/원장 모두
// 저장할 수 있다(환자 핵심프로필과 달리 서버단 role 체크 불필요, task.md 지시).
export async function POST(request: Request) {
  const formData = await request.formData();
  const programName = String(formData.get("programName") ?? "").trim();
  const targetSymptomKeywordsRaw = formData.get("targetSymptomKeywords");
  const targetSymptomKeywords =
    typeof targetSymptomKeywordsRaw === "string" && targetSymptomKeywordsRaw.trim()
      ? targetSymptomKeywordsRaw.trim()
      : null;
  const linkedTestTypeRaw = formData.get("linkedTestType");
  const linkedTestType = isLinkedTestType(linkedTestTypeRaw) ? linkedTestTypeRaw : null;
  const ctaButtonLabelRaw = formData.get("ctaButtonLabel");
  const ctaButtonLabel =
    typeof ctaButtonLabelRaw === "string" && ctaButtonLabelRaw.trim() ? ctaButtonLabelRaw.trim() : null;

  if (!programName) {
    return NextResponse.json({ error: "프로그램명을 입력하세요." }, { status: 400 });
  }

  let supportImagePath: string | null = null;
  const imageFile = formData.get("supportImage");
  if (imageFile instanceof File && imageFile.size > 0) {
    const resized = await saveResizedImage(imageFile);
    supportImagePath = resized.path;
  }

  const program = await createProgramTeaching({
    programName,
    targetSymptomKeywords,
    linkedTestType,
    supportImagePath,
    ctaButtonLabel,
    ...readContentFieldsFromFormData(formData),
  });

  return NextResponse.json(program, { status: 201 });
}
