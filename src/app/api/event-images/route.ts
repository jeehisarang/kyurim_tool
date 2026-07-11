import { NextResponse } from "next/server";
import { createEventImage, listEventImages } from "@/lib/event-images";
import { saveCompositeImage, saveEventBackgroundImage } from "@/lib/image-upload";

export async function GET() {
  const rows = await listEventImages();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const rawIdea = String(formData.get("rawIdea") ?? "").trim();
  const finalTitle = String(formData.get("finalTitle") ?? "").trim();
  const finalCopy = String(formData.get("finalCopy") ?? "").trim();
  const createdByStaffId = Number(formData.get("createdByStaffId"));
  const backgroundImage = formData.get("backgroundImage");
  const compositeImage = formData.get("compositeImage");

  if (!rawIdea || !finalTitle || !finalCopy || !createdByStaffId) {
    return NextResponse.json(
      { error: "아이디어, 타이틀, 본문, 작성자를 모두 확인해주세요." },
      { status: 400 },
    );
  }
  if (!(backgroundImage instanceof File) || backgroundImage.size === 0) {
    return NextResponse.json({ error: "배경 이미지를 업로드해주세요." }, { status: 400 });
  }
  if (!(compositeImage instanceof File) || compositeImage.size === 0) {
    return NextResponse.json({ error: "합성 결과 이미지가 없습니다." }, { status: 400 });
  }

  const background = await saveEventBackgroundImage(backgroundImage);
  const composite = await saveCompositeImage(compositeImage);

  const eventImage = await createEventImage({
    rawIdea,
    finalTitle,
    finalCopy,
    backgroundImagePath: background.path,
    compositeImagePath: composite.path,
    createdByStaffId,
  });

  return NextResponse.json(eventImage, { status: 201 });
}
