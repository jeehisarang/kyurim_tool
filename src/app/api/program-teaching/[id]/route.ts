import { NextResponse } from "next/server";
import {
  getProgramTeaching,
  isLinkedTestType,
  readContentFieldsFromFormData,
  updateProgramTeaching,
  type LinkedTestType,
} from "@/lib/program-teaching";
import { saveResizedImage } from "@/lib/image-upload";

// 수정/이미지 교체/비활성화(내리기) 모두 이 PATCH 하나로 처리한다(announcements와 동일 원칙) —
// 항상 FormData로 받는다. linkedTestType/셀링·학술 6개 필드는 아예 안 보내면 "변경 없음",
// 빈 문자열이면 "없음으로 변경"된다. 협업 입력이라 role 체크는 하지 않는다(task.md 지시).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const programId = Number(id);

  const existing = await getProgramTeaching(programId);
  if (!existing) {
    return NextResponse.json({ error: "프로그램 자료를 찾을 수 없습니다." }, { status: 404 });
  }

  const formData = await request.formData();

  const programNameRaw = formData.get("programName");
  const targetSymptomKeywordsRaw = formData.get("targetSymptomKeywords");
  const linkedTestTypeRaw = formData.get("linkedTestType");
  const isActiveRaw = formData.get("isActive");
  const removeImageRaw = formData.get("removeImage");
  const ctaButtonLabelRaw = formData.get("ctaButtonLabel");

  const programName =
    typeof programNameRaw === "string" && programNameRaw.trim() ? programNameRaw.trim() : undefined;
  const targetSymptomKeywords =
    typeof targetSymptomKeywordsRaw === "string" ? targetSymptomKeywordsRaw.trim() || null : undefined;
  const isActive = isActiveRaw === "true" ? true : isActiveRaw === "false" ? false : undefined;
  const ctaButtonLabel =
    typeof ctaButtonLabelRaw === "string" ? ctaButtonLabelRaw.trim() || null : undefined;

  let linkedTestType: LinkedTestType | null | undefined;
  if (linkedTestTypeRaw === "") {
    linkedTestType = null;
  } else if (isLinkedTestType(linkedTestTypeRaw)) {
    linkedTestType = linkedTestTypeRaw;
  }

  let supportImagePath: string | null | undefined;
  const imageFile = formData.get("supportImage");
  if (imageFile instanceof File && imageFile.size > 0) {
    const resized = await saveResizedImage(imageFile);
    supportImagePath = resized.path;
  } else if (removeImageRaw === "true") {
    supportImagePath = null;
  }

  const updated = await updateProgramTeaching(programId, {
    ...(programName !== undefined ? { programName } : {}),
    ...(targetSymptomKeywords !== undefined ? { targetSymptomKeywords } : {}),
    ...(linkedTestType !== undefined ? { linkedTestType } : {}),
    ...(supportImagePath !== undefined ? { supportImagePath } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...(ctaButtonLabel !== undefined ? { ctaButtonLabel } : {}),
    ...readContentFieldsFromFormData(formData),
  });

  return NextResponse.json(updated);
}
