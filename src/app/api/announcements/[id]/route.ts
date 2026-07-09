import { NextResponse } from "next/server";
import { deleteAnnouncement, updateAnnouncement } from "@/lib/announcements";

// 공지사항 startDate/endDate와 동일한 자정 정규화 원칙(YYYY-MM-DD를 로컬 자정으로 파싱).
function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

// 수정/내리기(재활성화)/삭제 모두 이 PATCH 하나로 처리한다 — 어떤 필드를 보냈는지에 따라
// 부분 업데이트되므로, "내리기" 버튼은 { isActive: false }만 보내면 된다.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const announcementId = Number(id);
  const body = await request.json();

  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  const content = typeof body.content === "string" ? body.content.trim() : undefined;
  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;

  if (title !== undefined && title.length === 0) {
    return NextResponse.json({ error: "제목을 입력하세요." }, { status: 400 });
  }
  if (content !== undefined && content.length === 0) {
    return NextResponse.json({ error: "내용을 입력하세요." }, { status: 400 });
  }

  let startDate: Date | undefined;
  if (body.startDate !== undefined) {
    const parsed = parseDate(body.startDate);
    if (parsed === null) {
      return NextResponse.json({ error: "시작일 형식이 올바르지 않습니다." }, { status: 400 });
    }
    startDate = parsed;
  }

  let endDate: Date | null | undefined;
  if (body.endDate !== undefined) {
    const parsed = parseDate(body.endDate);
    if (parsed === null && body.endDate) {
      return NextResponse.json({ error: "종료일 형식이 올바르지 않습니다." }, { status: 400 });
    }
    endDate = parsed ?? null;
  }

  const announcement = await updateAnnouncement(announcementId, {
    ...(title !== undefined ? { title } : {}),
    ...(content !== undefined ? { content } : {}),
    ...(startDate !== undefined ? { startDate } : {}),
    ...(endDate !== undefined ? { endDate } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  });

  return NextResponse.json(announcement);
}

// 하위 참조 테이블이 없어 WorkTask/검사기록과 동일하게 하드 삭제한다.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteAnnouncement(Number(id));
  return NextResponse.json({ ok: true });
}
