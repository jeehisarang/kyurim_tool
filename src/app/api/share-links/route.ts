import { NextResponse } from "next/server";
import { createOrReuseShareLink, InvalidShareLinkComboError } from "@/lib/share-links";

export async function POST(request: Request) {
  const body = await request.json();
  const patientId = Number(body.patientId);
  const teachingPageId = body.teachingPageId != null ? Number(body.teachingPageId) : null;
  const eventImageId = body.eventImageId != null ? Number(body.eventImageId) : null;
  const createdByStaffId = Number(body.createdByStaffId);

  if (!patientId || !createdByStaffId) {
    return NextResponse.json({ error: "환자와 작성자를 확인해주세요." }, { status: 400 });
  }

  try {
    const link = await createOrReuseShareLink({ patientId, teachingPageId, eventImageId, createdByStaffId });
    return NextResponse.json(link, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidShareLinkComboError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "공유링크 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
