import { NextResponse } from "next/server";
import { createEventImage, listActiveEventImages, listEventImages } from "@/lib/event-images";
import { saveCompositeImage, saveEventBackgroundImage } from "@/lib/image-upload";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("activeOnly") === "1";
  const rows = activeOnly ? await listActiveEventImages() : await listEventImages();
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
  // "완성된 이미지 그대로 사용" 모드(task.md) — 외부 도구에서 문구까지 포함해 만든
  // 완제품 배너를 그대로 저장한다. 이땐 텍스트 합성을 건너뛰므로 compositeImage를
  // 따로 받지 않고 배경 경로를 그대로 재사용하며, 타이틀/본문도 선택사항이 된다.
  const useRawImage = formData.get("useRawImage") === "true";

  if (!createdByStaffId) {
    return NextResponse.json({ error: "작성자를 확인해주세요." }, { status: 400 });
  }
  if (!useRawImage && (!rawIdea || !finalTitle || !finalCopy)) {
    return NextResponse.json(
      { error: "아이디어, 타이틀, 본문을 모두 확인해주세요." },
      { status: 400 },
    );
  }
  if (!(backgroundImage instanceof File) || backgroundImage.size === 0) {
    return NextResponse.json({ error: "배경 이미지를 업로드해주세요." }, { status: 400 });
  }
  if (!useRawImage && (!(compositeImage instanceof File) || compositeImage.size === 0)) {
    return NextResponse.json({ error: "합성 결과 이미지가 없습니다." }, { status: 400 });
  }

  const background = await saveEventBackgroundImage(backgroundImage);
  const compositeImagePath = useRawImage
    ? background.path
    : (await saveCompositeImage(compositeImage as File)).path;

  const eventImage = await createEventImage({
    rawIdea,
    finalTitle,
    finalCopy,
    backgroundImagePath: background.path,
    compositeImagePath,
    createdByStaffId,
  });

  return NextResponse.json(eventImage, { status: 201 });
}
