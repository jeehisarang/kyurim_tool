import { NextResponse } from "next/server";
import { getEventImage, setEventImageActive } from "@/lib/event-images";

// 비활성화/재활성화만 처리한다(소프트 삭제 원칙) — 문구/이미지 수정은 이번 범위 밖.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eventImageId = Number(id);

  const existing = await getEventImage(eventImageId);
  if (!existing) {
    return NextResponse.json({ error: "이벤트 이미지를 찾을 수 없습니다." }, { status: 404 });
  }

  const formData = await request.formData();
  const isActiveRaw = formData.get("isActive");
  const isActive = isActiveRaw === "true" ? true : isActiveRaw === "false" ? false : undefined;

  if (isActive === undefined) {
    return NextResponse.json({ error: "isActive 값을 확인해주세요." }, { status: 400 });
  }

  const updated = await setEventImageActive(eventImageId, isActive);
  return NextResponse.json(updated);
}
