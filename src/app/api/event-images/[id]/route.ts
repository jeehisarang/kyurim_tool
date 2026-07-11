import { NextResponse } from "next/server";
import { deleteEventImage, getEventImage, updateEventImage } from "@/lib/event-images";
import { deleteUploadedFile, saveCompositeImage, saveEventBackgroundImage } from "@/lib/image-upload";

// isActive 토글(비활성화 원칙 유지)과, 원본 아이디어/문구/배경이미지 수정을 함께 처리한다.
// 배경 이미지는 보낸 경우에만 재업로드+교체(재합성은 클라이언트가 만들어 보낸
// compositeImage로 반영) — 안 보내면 기존 배경을 그대로 유지한다.
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

  const rawIdeaRaw = formData.get("rawIdea");
  const finalTitleRaw = formData.get("finalTitle");
  const finalCopyRaw = formData.get("finalCopy");
  const rawIdea = typeof rawIdeaRaw === "string" && rawIdeaRaw.trim() ? rawIdeaRaw.trim() : undefined;
  const finalTitle = typeof finalTitleRaw === "string" && finalTitleRaw.trim() ? finalTitleRaw.trim() : undefined;
  const finalCopy = typeof finalCopyRaw === "string" && finalCopyRaw.trim() ? finalCopyRaw.trim() : undefined;

  let backgroundImagePath: string | undefined;
  const backgroundImage = formData.get("backgroundImage");
  if (backgroundImage instanceof File && backgroundImage.size > 0) {
    const saved = await saveEventBackgroundImage(backgroundImage);
    backgroundImagePath = saved.path;
  }

  // "완성된 이미지 그대로 사용" 모드(task.md) — 텍스트 합성 없이 배경을 그대로
  // compositeImagePath로 쓴다. 배경을 새로 안 올렸으면 기존 배경 경로를 그대로 쓴다.
  const useRawImage = formData.get("useRawImage") === "true";
  let compositeImagePath: string | undefined;
  if (useRawImage) {
    const effectiveBackgroundPath = backgroundImagePath ?? existing.backgroundImagePath;
    if (effectiveBackgroundPath !== existing.compositeImagePath) {
      compositeImagePath = effectiveBackgroundPath;
    }
  } else {
    const compositeImage = formData.get("compositeImage");
    if (compositeImage instanceof File && compositeImage.size > 0) {
      const saved = await saveCompositeImage(compositeImage);
      compositeImagePath = saved.path;
    }
  }

  if (
    isActive === undefined &&
    rawIdea === undefined &&
    finalTitle === undefined &&
    finalCopy === undefined &&
    backgroundImagePath === undefined &&
    compositeImagePath === undefined
  ) {
    return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
  }

  const updated = await updateEventImage(eventImageId, {
    ...(rawIdea !== undefined ? { rawIdea } : {}),
    ...(finalTitle !== undefined ? { finalTitle } : {}),
    ...(finalCopy !== undefined ? { finalCopy } : {}),
    ...(backgroundImagePath !== undefined ? { backgroundImagePath } : {}),
    ...(compositeImagePath !== undefined ? { compositeImagePath } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  });

  // 교체된 옛 파일은 정리한다(best-effort, 실패해도 수정 자체는 이미 성공).
  if (backgroundImagePath && existing.backgroundImagePath !== backgroundImagePath) {
    await deleteUploadedFile(existing.backgroundImagePath);
  }
  if (compositeImagePath && existing.compositeImagePath !== compositeImagePath) {
    await deleteUploadedFile(existing.compositeImagePath);
  }

  return NextResponse.json(updated);
}

// 완전 삭제(task.md) — 비활성화와 별개의 더 강한 액션. DB 레코드와 배경원본/합성결과
// 이미지 파일을 모두 정리한다.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eventImageId = Number(id);

  const existing = await getEventImage(eventImageId);
  if (!existing) {
    return NextResponse.json({ error: "이벤트 이미지를 찾을 수 없습니다." }, { status: 404 });
  }

  await deleteEventImage(eventImageId);
  await deleteUploadedFile(existing.backgroundImagePath);
  await deleteUploadedFile(existing.compositeImagePath);

  return NextResponse.json({ ok: true });
}
